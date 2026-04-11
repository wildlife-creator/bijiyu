"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./message-bubble";
import { markAsReadAction } from "@/app/(authenticated)/messages/[threadId]/actions";

export interface ScoutJobInfo {
  id: string;
  title: string;
  tradeType: string | null;
  headcount: number | null;
  recruitEndDate: string | null;
  rewardLower: number | null;
  rewardUpper: number | null;
  prefecture: string | null;
  recruitStartDate: string | null;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  signed_image_url?: string | null;
  job_id: string | null;
  is_scout: boolean;
  is_proxy: boolean;
  read_at: string | null;
  scout_status: string | null;
  created_at: string;
  scout_job?: ScoutJobInfo | null;
}

interface MessageListProps {
  threadId: string;
  currentUserId: string;
  initialMessages: Message[];
  participantAvatarUrl?: string | null;
  participantName?: string;
  showScoutActions: boolean;
  showProxyBadge: boolean;
}

export function MessageList({
  threadId,
  currentUserId,
  initialMessages,
  participantAvatarUrl,
  participantName,
  showScoutActions,
  showProxyBadge,
}: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const markUnreadAsRead = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const unreadIds = messages
        .filter((m) => m.sender_id !== currentUserId && !m.read_at)
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
  }, [messages, currentUserId]);

  useEffect(() => {
    markUnreadAsRead();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [markUnreadAsRead]);

  // Supabase Realtime
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
        (payload) => {
          const newMessage = payload.new as Message;
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
  }, [threadId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          messageId={message.id}
          body={message.body}
          signedImageUrl={message.signed_image_url}
          createdAt={message.created_at}
          isMine={message.sender_id === currentUserId}
          isScout={message.is_scout}
          isProxy={message.is_proxy}
          showProxyBadge={showProxyBadge}
          isRead={message.read_at !== null}
          scoutStatus={message.scout_status}
          scoutJob={message.scout_job}
          showScoutActions={showScoutActions}
          senderAvatarUrl={
            message.sender_id !== currentUserId
              ? participantAvatarUrl
              : undefined
          }
          senderName={
            message.sender_id !== currentUserId ? participantName : undefined
          }
        />
      ))}
    </div>
  );
}
