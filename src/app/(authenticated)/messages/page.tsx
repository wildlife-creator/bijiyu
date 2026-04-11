import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThreadListItem } from "@/components/messaging/thread-list-item";
import { BackButton } from "@/components/shared/back-button";
import { resolveParticipantName } from "@/lib/utils/display-name";

interface Props {
  searchParams: Promise<{ type?: string }>;
}

export default async function MessagesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user role + org info
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const isClientOrStaff =
    userData?.role === "client" || userData?.role === "staff";

  // Get user's organization (if any)
  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const threadTypeFilter = params.type || "all";

  // Fetch threads: RLS handles access (participant OR org member)
  let query = supabase
    .from("message_threads")
    .select(
      `id, thread_type, organization_id, updated_at,
       participant_1:users!message_threads_participant_1_id_fkey(id, last_name, first_name, company_name, avatar_url),
       participant_2:users!message_threads_participant_2_id_fkey(id, last_name, first_name, company_name, avatar_url),
       organizations(id, name),
       messages(id, body, sender_id, read_at, created_at)`,
    )
    .order("updated_at", { ascending: false });

  if (threadTypeFilter === "message") {
    query = query.eq("thread_type", "message");
  } else if (threadTypeFilter === "scout") {
    query = query.eq("thread_type", "scout");
  }

  const { data: threads } = await query;

  // Process threads for display
  const threadItems = (threads ?? []).map((thread) => {
    const participant1 = thread.participant_1 as unknown as {
      id: string; last_name: string | null; first_name: string | null; company_name: string | null; avatar_url: string | null;
    } | null;
    const participant2 = thread.participant_2 as unknown as {
      id: string; last_name: string | null; first_name: string | null; company_name: string | null; avatar_url: string | null;
    } | null;
    const org = thread.organizations as unknown as { id: string; name: string } | null;

    // Determine which side the user is on:
    // - contractor side: user is participant_2
    // - org/client side: user is participant_1, or user is org member (not a direct participant)
    const isContractorSide = participant2?.id === user.id;
    let participantName: string;
    let participantAvatarUrl: string | null;

    if (isContractorSide) {
      // Contractor viewing: org.name → company_name → personal name
      participantName = resolveParticipantName({
        organizationName: org?.name,
        companyName: participant1?.company_name,
        lastName: participant1?.last_name,
        firstName: participant1?.first_name,
      });
      participantAvatarUrl = participant1?.avatar_url ?? null;
    } else {
      // Client/staff/org member viewing: company_name → personal name
      participantName = resolveParticipantName({
        companyName: participant2?.company_name,
        lastName: participant2?.last_name,
        firstName: participant2?.first_name,
      });
      participantAvatarUrl = participant2?.avatar_url ?? null;
    }

    const messages = (thread.messages ?? []) as Array<{
      id: string; body: string; sender_id: string; read_at: string | null; created_at: string;
    }>;

    const sortedMessages = [...messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const latestMessage = sortedMessages[0] ?? null;

    const unreadCount = messages.filter(
      (m) => m.sender_id !== user.id && !m.read_at,
    ).length;

    return {
      threadId: thread.id,
      participantName,
      participantAvatarUrl,
      lastMessageBody: latestMessage?.body ?? null,
      lastMessageAt: latestMessage?.created_at ?? thread.updated_at,
      threadType: thread.thread_type,
      unreadCount,
    };
  });

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl">
        <h1 className="py-4 text-center text-lg font-bold text-secondary">メッセージ</h1>

        {isClientOrStaff && (
          <div className="flex items-center justify-center gap-3 px-4 pb-4">
            <Button asChild className="rounded-full bg-primary text-white hover:bg-primary/90">
              <Link href="/messages/bulk-send">一斉送信</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/messages/scout-send">スカウトのテンプレート</Link>
            </Button>
          </div>
        )}

        <div className="flex border-b border-border">
          {[
            { key: "all", label: "すべて", href: "/messages" },
            { key: "message", label: "メッセージ", href: "/messages?type=message" },
            { key: "scout", label: "スカウト", href: "/messages?type=scout" },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex-1 py-2 text-center text-sm ${
                threadTypeFilter === tab.key
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="bg-background">
          {threadItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              メッセージはありません
            </div>
          ) : (
            threadItems.map((item) => (
              <ThreadListItem key={item.threadId} {...item} />
            ))
          )}
        </div>

        <div className="flex flex-col items-center gap-3 py-8">
          <BackButton className="w-full max-w-xs" />
        </div>
      </div>
    </div>
  );
}
