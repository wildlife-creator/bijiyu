import { redirect } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MessageThreadView } from "@/components/messaging/message-thread-view";
import type { Message, ScoutJobInfo } from "@/components/messaging/types";
import { MessageHeader } from "@/components/messaging/message-header";
import { resolveCounterpartyDisplay } from "@/lib/messaging/counterparty-display";
import { fetchScoutJobInfo } from "@/lib/messaging/fetch-scout-job";
import { resolveSideUserIds } from "@/lib/messaging/scout-recipient";

// メッセージ通知は相手組織のメンバー全員宛にメールを直列送信する
// （最大31通 ≒ 約20秒）ため、タイムアウトしないよう実行時間上限を延長する
export const maxDuration = 60;

interface Props {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadDetailPage({ params }: Props) {
  const { threadId } = await params;
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

  // スカウト応答ボタンの表示可否（ステージング指摘 No.33 で判定を変更）。
  // 旧実装は「個人 identity 側 (organization_X_id が null な side) の participant = 受注者」
  // と決め打ちしていたため、法人プランの会員が職人としてスカウトを受ける（両側が組織
  // identity になる）とボタンが一切出なかった。
  // 新ルール: スレッドを見られる人は必ずどちらかの side に居るので、
  //   - 「送った側」の除外はメッセージ単位の isMine 判定（MessageThreadView 側、
  //     side の user id 集合ベース）で行う → 受信側 = 送信者の反対側 が自然に残る
  //   - 担当者（staff）は受注者アクション不可（roles-and-permissions.md）なので除外し、
  //     代わりに「返答は管理責任者のみ」の案内を出す（viewerIsStaff）
  // respondToScoutAction 側は resolveScoutRecipientUserIds + role で同じ判定を行う（二重防御）。
  const { data: viewerRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const viewerIsStaff = viewerRow?.role === "staff";
  const showScoutActions = !viewerIsStaff;

  // 代理バッジは viewer が組織側 (送信元組織メンバー) のときのみ表示
  const showProxyBadge = counterparty.viewerIsOrgSide;

  // 吹き出しの左右（自分側 / 相手側）判定用に、両 side の user id 集合を解決する（P5）。
  // 旧実装は「個人 identity 側 = 受注者」前提で contractorId と比較していたため、
  // 両側が組織のスレッド（運営の組織 ⇔ 法人発注者）で崩れていた。
  // 組織側は organization_members 全員（代理スタッフの送信も自分側に含める）、
  // 個人側は participant 本人のみ。他組織のメンバーは RLS で読めないため admin client。
  const admin = createAdminClient();
  const mySideParticipantId = counterparty.viewerOnSide2
    ? thread.participant_2_id
    : thread.participant_1_id;
  const counterSideParticipantId = counterparty.viewerOnSide2
    ? thread.participant_1_id
    : thread.participant_2_id;
  const mySideOrgId = counterparty.viewerOnSide2
    ? thread.organization_2_id
    : thread.organization_1_id;
  const counterSideOrgId = counterparty.viewerOnSide2
    ? thread.organization_1_id
    : thread.organization_2_id;
  const [ownSideUserIds, counterpartSideUserIds] = await Promise.all([
    resolveSideUserIds(admin, mySideOrgId, mySideParticipantId),
    resolveSideUserIds(admin, counterSideOrgId, counterSideParticipantId),
  ]);

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
        scoutJob = await fetchScoutJobInfo(supabase, m.job_id);
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
          ownSideUserIds={ownSideUserIds}
          counterpartSideUserIds={counterpartSideUserIds}
          viewerIsOrgSide={counterparty.viewerIsOrgSide}
          initialMessages={messages}
          participantAvatarUrl={counterparty.avatarUrl}
          participantName={counterparty.name}
          showScoutActions={showScoutActions}
          viewerIsStaff={viewerIsStaff}
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
