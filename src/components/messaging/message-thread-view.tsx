"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { markAsReadAction } from "@/app/(authenticated)/messages/[threadId]/actions";
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
}

/**
 * 送信者がどちら側の発信か（受注者 1 人 vs 発注者側オーナー+スタッフ複数）。
 * 受注者の id と一致すれば受注者側、それ以外（オーナー、組織スタッフ、代理スタッフ）は発注者側。
 */
function isMessageOnContractorSide(
  senderId: string,
  contractorId: string,
): boolean {
  return senderId === contractorId;
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
}: MessageThreadViewProps) {
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
            isMessageOnContractorSide(m.sender_id, contractorId) !==
              isContractorSide && !m.read_at,
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
          const messageIsMine =
            isMessageOnContractorSide(message.sender_id, contractorId) ===
            isContractorSide;
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
              showScoutActions={showScoutActions}
              showProxyBadge={!isContractorSide}
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
      />
    </>
  );
}
