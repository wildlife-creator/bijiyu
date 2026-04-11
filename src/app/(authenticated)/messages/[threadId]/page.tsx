import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { MessageThreadView } from "@/components/messaging/message-thread-view";
import type { Message, ScoutJobInfo } from "@/components/messaging/message-list";
import { MessageHeader } from "@/components/messaging/message-header";
import { resolveParticipantName } from "@/lib/utils/display-name";

interface Props {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ showScoutActions?: string }>;
}

export default async function ThreadDetailPage({ params, searchParams }: Props) {
  const { threadId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch thread (RLS handles access: participant OR org member)
  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .select(
      `id, thread_type, participant_1_id, participant_2_id, organization_id,
       participant_1:users!message_threads_participant_1_id_fkey(id, last_name, first_name, company_name, avatar_url),
       participant_2:users!message_threads_participant_2_id_fkey(id, last_name, first_name, company_name, avatar_url),
       organizations(id, name)`,
    )
    .eq("id", threadId)
    .single();

  if (threadError || !thread) redirect("/messages");

  // Determine "other" participant display
  const participant1 = thread.participant_1 as unknown as {
    id: string; last_name: string | null; first_name: string | null; company_name: string | null; avatar_url: string | null;
  } | null;
  const participant2 = thread.participant_2 as unknown as {
    id: string; last_name: string | null; first_name: string | null; company_name: string | null; avatar_url: string | null;
  } | null;
  const org = thread.organizations as unknown as { id: string; name: string } | null;

  // From contractor's perspective: org.name → company_name → personal name
  // From org member's perspective: company_name → personal name
  const isContractorSide = thread.participant_2_id === user.id;
  let otherName: string;
  let otherAvatarUrl: string | null;

  if (isContractorSide) {
    otherName = resolveParticipantName({
      organizationName: org?.name,
      companyName: participant1?.company_name,
      lastName: participant1?.last_name,
      firstName: participant1?.first_name,
    });
    otherAvatarUrl = participant1?.avatar_url ?? null;
  } else {
    otherName = resolveParticipantName({
      companyName: participant2?.company_name,
      lastName: participant2?.last_name,
      firstName: participant2?.first_name,
    });
    otherAvatarUrl = participant2?.avatar_url ?? null;
  }

  // Scout actions: only show for contractor (participant_2), not for org side
  const showScoutActions =
    sp.showScoutActions !== "false" && thread.participant_2_id === user.id;

  // Check if current user is a proxy account (for optimistic UI)
  const { data: currentOrgMember } = await supabase
    .from("organization_members")
    .select("is_proxy_account")
    .eq("user_id", user.id)
    .maybeSingle();
  const isProxyAccount = currentOrgMember?.is_proxy_account === true;

  // Fetch messages
  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  // For scout messages, fetch job info and generate signed URLs
  const messages: Message[] = await Promise.all(
    (rawMessages ?? []).map(async (m) => {
      let signedImageUrl: string | null = null;
      if (m.image_url) {
        const { data: signedData } = await supabase.storage
          .from("message-attachments")
          .createSignedUrl(m.image_url, 3600);
        signedImageUrl = signedData?.signedUrl ?? null;
      }

      let scoutJob: ScoutJobInfo | null = null;
      if (m.is_scout && m.job_id) {
        const { data: job } = await supabase
          .from("jobs")
          .select("id, title, trade_type, headcount, recruit_end_date, reward_lower, reward_upper, prefecture, recruit_start_date")
          .eq("id", m.job_id)
          .single();
        if (job) {
          scoutJob = {
            id: job.id,
            title: job.title,
            tradeType: job.trade_type,
            headcount: job.headcount,
            recruitEndDate: job.recruit_end_date,
            rewardLower: job.reward_lower,
            rewardUpper: job.reward_upper,
            prefecture: job.prefecture,
            recruitStartDate: job.recruit_start_date,
          };
        }
      }

      return {
        id: m.id,
        thread_id: m.thread_id,
        sender_id: m.sender_id,
        body: m.body,
        image_url: m.image_url,
        signed_image_url: signedImageUrl,
        job_id: m.job_id,
        is_scout: m.is_scout,
        is_proxy: m.is_proxy,
        read_at: m.read_at,
        scout_status: m.scout_status ?? null,
        created_at: m.created_at,
        scout_job: scoutJob,
      };
    }),
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F0F0F0]">
      {/* Header */}
      <MessageHeader name={otherName} />

      {/* Message thread: list + input (connected via optimistic updates) */}
      <MessageThreadView
        threadId={threadId}
        currentUserId={user.id}
        initialMessages={messages}
        participantAvatarUrl={otherAvatarUrl}
        participantName={otherName}
        showScoutActions={showScoutActions}
        isContractorSide={isContractorSide}
        isProxyAccount={isProxyAccount}
      />
    </div>
  );
}
