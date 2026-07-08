import { redirect } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { MessageThreadView } from "@/components/messaging/message-thread-view";
import type { Message, ScoutJobInfo } from "@/components/messaging/message-list";
import { MessageHeader } from "@/components/messaging/message-header";
import { resolveCounterpartyDisplay } from "@/lib/messaging/counterparty-display";

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

  // Phase 2: 新 org カラム + 両側 organization の owner nested を取得
  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .select(
      `id, thread_type,
       participant_1_id, participant_2_id,
       organization_1_id, organization_2_id,
       participant_1:users!message_threads_participant_1_id_fkey(
         id, last_name, first_name, company_name, avatar_url, deleted_at,
         client_profiles(display_name, image_url)
       ),
       participant_2:users!message_threads_participant_2_id_fkey(
         id, last_name, first_name, company_name, avatar_url, deleted_at,
         client_profiles(display_name, image_url)
       ),
       organization_1:organizations!organization_1_id(
         owner_user:users!owner_id(
           last_name, first_name, deleted_at,
           client_profiles(display_name, image_url)
         )
       ),
       organization_2:organizations!organization_2_id(
         owner_user:users!owner_id(
           last_name, first_name, deleted_at,
           client_profiles(display_name, image_url)
         )
       )`,
    )
    .eq("id", threadId)
    .single();

  if (threadError || !thread) redirect("/messages");

  // viewer の active org + 代理アカウント判定
  const { active } = await getActiveOrganizationContext(supabase);
  const myOrgId = active?.organizationId ?? null;
  const isProxyAccount = active?.isProxyAccount === true;

  // Phase 2: identity ベースで counterparty の表示情報を解決 (席の意味撤廃)
  const counterparty = resolveCounterpartyDisplay(
    // 型の後方互換のため as で通す (SELECT の nested 型を厳密に書くと大きくなる)
    thread as unknown as Parameters<typeof resolveCounterpartyDisplay>[0],
    user.id,
    myOrgId,
  );

  // Phase 2: スカウト応答ボタンは「個人 identity 側 (organization_X_id が null な side に
  // 居る personal participant)」なら表示。受注者は必ず個人 identity という業務ルールに基づく。
  // 旧実装は「counterpart が組織側」を追加要件にしていたため、個人発注者スカウトを
  // 受け取った受注者側でボタンが出ない (R2 ②) バグがあった。
  // 送信者本人の重複表示は respondToScoutAction 側で二重防御でブロックする。
  const viewerIsPersonalIndividualParticipant =
    (thread.participant_1_id === user.id &&
      thread.organization_1_id === null) ||
    (thread.participant_2_id === user.id &&
      thread.organization_2_id === null);
  const showScoutActions =
    sp.showScoutActions !== "false" && viewerIsPersonalIndividualParticipant;

  // 代理バッジは viewer が組織側 (送信元組織メンバー) のときのみ表示
  const showProxyBadge = counterparty.viewerIsOrgSide;

  // MessageThreadView が期待する contractorId (個人 identity 側の participant)
  const contractorId = counterparty.viewerOnSide2
    ? thread.participant_1_id
    : thread.participant_2_id;

  // MessageBubble の isMine 判定用 isContractorSide フラグ:
  // 「viewer が個人 identity (組織所属していない) 側」のとき true
  const isContractorSide = !counterparty.viewerIsOrgSide;

  const isCounterpartDeleted = counterparty.deletedAt !== null;

  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

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
          .select(
            "id, title, trade_types, headcount, recruit_end_date, reward_lower, reward_upper, recruit_start_date",
          )
          .eq("id", m.job_id)
          .single();
        if (job) {
          const { data: jobAreaRows } = await supabase
            .from("job_areas")
            .select("prefecture, municipality")
            .eq("job_id", job.id);
          scoutJob = {
            id: job.id,
            title: job.title,
            tradeTypes: job.trade_types ?? [],
            headcount: job.headcount,
            recruitEndDate: job.recruit_end_date,
            rewardLower: job.reward_lower,
            rewardUpper: job.reward_upper,
            areas: (jobAreaRows ?? []).map((a) => ({
              prefecture: a.prefecture,
              municipality: a.municipality,
            })),
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
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
        <MessageHeader name={counterparty.name} />

        <MessageThreadView
          threadId={threadId}
          currentUserId={user.id}
          contractorId={contractorId}
          initialMessages={messages}
          participantAvatarUrl={counterparty.avatarUrl}
          participantName={counterparty.name}
          showScoutActions={showScoutActions}
          isContractorSide={isContractorSide}
          isProxyAccount={isProxyAccount}
          disabledMessage={
            isCounterpartDeleted ? "このユーザーは退会されました" : null
          }
          showProxyBadge={showProxyBadge}
        />
      </div>
    </div>
  );
}
