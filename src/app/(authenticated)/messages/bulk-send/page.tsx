import { redirect } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { BulkSendForm } from "./bulk-send-form";

interface Recipient {
  id: string;
  name: string;
}

interface ThreadParticipant {
  id: string;
  last_name: string | null;
  first_name: string | null;
  deleted_at: string | null;
}

/**
 * CLI-014 一斉送信
 *
 * Phase 2 identity ベース:
 *   自分 (または自組織) が絡むスレッドを identity 列で拾い、
 *   自分の反対側 (counterparty) の participant を宛先候補にする。
 *   受注者起点スレッド (participant_1 = 受注者、participant_2 = 発注者組織) も
 *   同一ロジックで正しく "受注者" を counterpart として抽出できる。
 */
export default async function BulkSendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { active } = await getActiveOrganizationContext(supabase);
  const organizationId = active?.organizationId ?? null;

  const involvementOr = [
    `participant_1_id.eq.${user.id}`,
    `participant_2_id.eq.${user.id}`,
  ];
  if (organizationId) {
    involvementOr.push(`organization_1_id.eq.${organizationId}`);
    involvementOr.push(`organization_2_id.eq.${organizationId}`);
  }
  const { data: threads } = await supabase
    .from("message_threads")
    .select(
      `id, participant_1_id, participant_2_id,
       organization_1_id, organization_2_id,
       participant_1:users!message_threads_participant_1_id_fkey(id, last_name, first_name, deleted_at),
       participant_2:users!message_threads_participant_2_id_fkey(id, last_name, first_name, deleted_at)`,
    )
    .or(involvementOr.join(","));

  const recipientMap = new Map<string, string>();
  for (const thread of threads ?? []) {
    const p1 = thread.participant_1 as unknown as ThreadParticipant | null;
    const p2 = thread.participant_2 as unknown as ThreadParticipant | null;

    // Phase 2: 自分がどちらの席にいるかを identity で判定し、反対側を counterpart にする
    //   1. participant として自分自身が居る → その side
    //   2. 組織メンバーとして自組織が organization_X_id に居る → その side
    let iAmOnSide2: boolean;
    if (thread.participant_1_id === user.id) {
      iAmOnSide2 = false;
    } else if (thread.participant_2_id === user.id) {
      iAmOnSide2 = true;
    } else if (
      organizationId &&
      thread.organization_1_id === organizationId
    ) {
      iAmOnSide2 = false;
    } else if (
      organizationId &&
      thread.organization_2_id === organizationId
    ) {
      iAmOnSide2 = true;
    } else {
      // involvement OR で拾ったのに match 無し (通常は起きない) → 安全側 skip
      continue;
    }
    const other = iAmOnSide2 ? p1 : p2;

    // 退会済みユーザーはメッセージが届かないため宛先候補から除外する
    if (other && !other.deleted_at && !recipientMap.has(other.id)) {
      const name =
        `${other.last_name || ""}${other.first_name || ""}`.trim() || "未設定";
      recipientMap.set(other.id, name);
    }
  }

  const recipients: Recipient[] = Array.from(recipientMap.entries()).map(
    ([id, name]) => ({ id, name }),
  );

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <BulkSendForm recipients={recipients} />
      </div>
    </div>
  );
}
