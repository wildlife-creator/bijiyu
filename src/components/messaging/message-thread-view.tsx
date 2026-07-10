"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { markAsReadAction } from "@/app/(authenticated)/messages/[threadId]/actions";
import { fetchScoutJobInfo } from "@/lib/messaging/fetch-scout-job";
import type { Message } from "./message-list";

interface MessageThreadViewProps {
  threadId: string;
  currentUserId: string;
  /** 受注者の user id（participant_2_id）。
   *  代理メッセージは法人スタッフの id で送信されるため、isMine 判定を
   *  「currentUserId と一致するか」だけで行うと、オーナーが自社スタッフの
   *  代理メッセージを「相手側」と誤認する（左側＋相手アバター表示）。
   *  side ベースで判定するために受注者 id を渡す。 */
  contractorId: string;
  initialMessages: Message[];
  participantAvatarUrl?: string | null;
  participantName?: string;
  showScoutActions: boolean;
  isContractorSide: boolean;
  isProxyAccount: boolean;
  /** A7: 相手が退会済みの場合の入力欄無効化メッセージ */
  disabledMessage?: string | null;
  /** Phase 2 (A4): 「代理」バッジを表示するかを親コンポーネントから明示する。
   *  未指定の場合は !isContractorSide の旧挙動（発注者側のみ表示）を継続。 */
  showProxyBadge?: boolean;
}

/**
 * メッセージが「自分側の発信」かを判定する。
 *
 * 個人 identity 側 (isContractorSide=true): 側が 1 人しかいないので
 *   単純に `sender_id === currentUserId` で判定。個人⇔個人スレッドは
 *   両側個人 identity なので双方向でこの分岐を使う。
 * 組織 identity 側 (isContractorSide=false): 代理送信 (法人スタッフの
 *   sender_id で送られる) を吸収するため、"contractor side ではない"
 *   (= senderId !== contractorId) を「自分側」とする。組織 Owner が自社
 *   代理スタッフのメッセージを「相手側」と誤認しない。
 *
 * Phase 2 で「席2=受注者」を廃止した結果、旧 `contractorId` 比較 shim は
 *   個人⇔個人ケースで対称性が崩れるため上記に切り替えた。
 */
function computeIsMine(
  senderId: string,
  currentUserId: string,
  contractorId: string,
  isContractorSide: boolean,
): boolean {
  if (isContractorSide) {
    // 個人 identity 側は 1 人しかいないので直判定
    return senderId === currentUserId;
  }
  // 組織 identity 側: contractor でなければ全員自分側 (代理送信 shim)
  return senderId !== contractorId;
}

export function MessageThreadView({
  threadId,
  currentUserId,
  contractorId,
  initialMessages,
  participantAvatarUrl,
  participantName,
  showScoutActions,
  isContractorSide,
  isProxyAccount,
  disabledMessage,
  showProxyBadge,
}: MessageThreadViewProps) {
  const resolvedShowProxyBadge = showProxyBadge ?? !isContractorSide;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark unread as read (debounced 4s)
  const markUnreadAsRead = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      // 相手側のメッセージだけ既読化（自分側=自社の代理含む はスキップ）
      const unreadIds = messages
        .filter(
          (m) =>
            !computeIsMine(
              m.sender_id,
              currentUserId,
              contractorId,
              isContractorSide,
            ) && !m.read_at,
        )
        .map((m) => m.id);

      if (unreadIds.length > 0) {
        markAsReadAction(unreadIds).then((result) => {
          if (result.success) {
            setMessages((prev) =>
              prev.map((m) =>
                unreadIds.includes(m.id)
                  ? { ...m, read_at: new Date().toISOString() }
                  : m,
              ),
            );
          }
        });
      }
    }, 4000);
  }, [messages, contractorId, isContractorSide]);

  useEffect(() => {
    markUnreadAsRead();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [markUnreadAsRead]);

  // Supabase Realtime (for messages from OTHER users)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:thread_id=${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          // Skip if this is our own message (handled by onSendComplete)
          if (newMessage.sender_id === currentUserId) return;

          // Generate signed URL if image attached
          if (newMessage.image_url) {
            const { data: signedData } = await supabase.storage
              .from("message-attachments")
              .createSignedUrl(newMessage.image_url, 3600);
            newMessage.signed_image_url = signedData?.signedUrl ?? null;
          }

          // Realtime payload には join 済みの案件情報が無いので別途取得する。
          // これを省くと ScoutInfoCard (承諾/辞退ボタン含む) がリロードまで
          // 描画されない (2026-07-10 staging で実例発生)
          if (newMessage.is_scout && newMessage.job_id) {
            newMessage.scout_job = await fetchScoutJobInfo(
              supabase,
              newMessage.job_id,
            );
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, currentUserId]);

  // Called by MessageInput BEFORE send (optimistic text)
  function handleOptimisticSend(body: string) {
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      thread_id: threadId,
      sender_id: currentUserId,
      body,
      image_url: null,
      job_id: null,
      is_scout: false,
      is_proxy: isProxyAccount,
      read_at: null,
      scout_status: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
  }

  // Called by MessageInput AFTER successful send (replace optimistic with real data)
  async function handleSendComplete(messageId: string) {
    const supabase = createClient();

    // Fetch the real message from DB
    const { data: realMessage } = await supabase
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (!realMessage) return;

    // Generate signed URL if image attached
    let signedImageUrl: string | null = null;
    if (realMessage.image_url) {
      const { data: signedData } = await supabase.storage
        .from("message-attachments")
        .createSignedUrl(realMessage.image_url, 3600);
      signedImageUrl = signedData?.signedUrl ?? null;
    }

    const completeMessage: Message = {
      id: realMessage.id,
      thread_id: realMessage.thread_id,
      sender_id: realMessage.sender_id,
      body: realMessage.body,
      image_url: realMessage.image_url,
      signed_image_url: signedImageUrl,
      job_id: realMessage.job_id,
      is_scout: realMessage.is_scout,
      is_proxy: realMessage.is_proxy,
      read_at: realMessage.read_at,
      scout_status: realMessage.scout_status ?? null,
      created_at: realMessage.created_at,
    };

    setMessages((prev) => {
      // Remove optimistic messages and add real one
      const withoutOptimistic = prev.filter(
        (m) => !m.id.startsWith("optimistic-"),
      );
      if (withoutOptimistic.some((m) => m.id === completeMessage.id))
        return withoutOptimistic;
      return [...withoutOptimistic, completeMessage];
    });
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((message) => {
          // side ベースで自分側判定（代理メッセージも自社=自分側として扱う）
          const messageIsMine = computeIsMine(
            message.sender_id,
            currentUserId,
            contractorId,
            isContractorSide,
          );
          return (
            <MessageBubble
              key={message.id}
              messageId={message.id}
              body={message.body}
              signedImageUrl={message.signed_image_url}
              createdAt={message.created_at}
              isMine={messageIsMine}
              isScout={message.is_scout}
              isProxy={message.is_proxy}
              isRead={message.read_at !== null}
              scoutStatus={message.scout_status}
              scoutJob={message.scout_job}
              // 自分 (自分側) が送ったスカウトには応答ボタンを出さない。
              // 個人発注者⇔受注者スレッドでは両側が個人 identity のため、
              // ページ単位の showScoutActions だけでは送信者側を除外できない
              showScoutActions={showScoutActions && !messageIsMine}
              showProxyBadge={resolvedShowProxyBadge}
              senderAvatarUrl={!messageIsMine ? participantAvatarUrl : undefined}
              senderName={!messageIsMine ? participantName : undefined}
            />
          );
        })}
      </div>
      <MessageInput
        threadId={threadId}
        onOptimisticSend={handleOptimisticSend}
        onSendComplete={handleSendComplete}
        disabledMessage={disabledMessage}
      />
    </>
  );
}
