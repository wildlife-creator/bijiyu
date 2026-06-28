import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export interface OrgMemberRecipient {
  userId: string;
  email: string;
  /** 受信者名（姓 + 名 スペースなし結合、欠損時「ご担当者」フォールバック） */
  displayName: string;
}

/**
 * M-03 既定: 組織メンバー全員（owner / admin / staff 全て）への broadcast 受信者リスト。
 *
 * §1 業務通知 (§1.1.A / §1.2.A / §1.3.A / §1.6.C / §1.6.D / §1.7.B) と §3.1.A 完了催促
 * など、業務イベントの控えメールで使用する。
 *
 * 「組織管理操作の控え」 (§5 系) は staff を含めない別ヘルパー
 * `getOrganizationManagementRecipients` (Owner + admin のみ) を使うこと。
 *
 * 除外仕様 (`getOrganizationManagementRecipients` と同形):
 *   - `users.deleted_at IS NULL` (退会済除外)
 *   - `users.is_active = true`   (法人プラン解約の連動凍結除外)
 *   - `email` が非空                (DB 異常時の防御)
 *   - `excludeUserIds` で個別除外
 *
 * 含める方針:
 *   - 操作者本人も対象 (操作のメール記録として保持)
 *   - 招待中 (`password_set_at IS NULL`) の admin / staff も対象
 *
 * 0 名のケースは空配列を返す (best-effort、Server Action 側で成功扱い継続)。
 */
export async function getOrganizationMemberRecipients(
  admin: SupabaseClient<Database>,
  organizationId: string,
  excludeUserIds: string[] = [],
): Promise<OrgMemberRecipient[]> {
  const { data: members, error: memErr } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (memErr || !members || members.length === 0) {
    return [];
  }

  const excludeSet = new Set(excludeUserIds);
  const candidateIds = members
    .map((m) => m.user_id)
    .filter((id) => !excludeSet.has(id));

  if (candidateIds.length === 0) return [];

  const { data: users, error: usrErr } = await admin
    .from("users")
    .select("id, email, last_name, first_name")
    .in("id", candidateIds)
    .is("deleted_at", null)
    .eq("is_active", true);

  if (usrErr || !users) return [];

  return users
    .filter((u) => typeof u.email === "string" && u.email.trim() !== "")
    .map((u) => ({
      userId: u.id,
      email: u.email as string,
      displayName:
        `${u.last_name ?? ""}${u.first_name ?? ""}`.trim() || "ご担当者",
    }));
}

/**
 * 案件 (job) を起点に、発注者側の通知配信先を解決する。
 *
 * - 個人プラン（job.organization_id が NULL） → オーナー本人 1 名
 * - 法人プラン（job.organization_id が NOT NULL） → 組織メンバー全員（M-03）
 *
 * オーナー本人解決パスは個人プラン専用 (法人プランは broadcast 側に集約)。
 * 法人プランで Owner も組織メンバーなので broadcast で必ず含まれる。
 */
export async function getJobClientRecipients(
  admin: SupabaseClient<Database>,
  job: { owner_id: string; organization_id: string | null },
  excludeUserIds: string[] = [],
): Promise<OrgMemberRecipient[]> {
  if (job.organization_id) {
    return getOrganizationMemberRecipients(
      admin,
      job.organization_id,
      excludeUserIds,
    );
  }

  if (excludeUserIds.includes(job.owner_id)) {
    return [];
  }

  const { data: owner, error } = await admin
    .from("users")
    .select("id, email, last_name, first_name, deleted_at, is_active")
    .eq("id", job.owner_id)
    .single();

  if (error || !owner) return [];
  if (owner.deleted_at) return [];
  if (owner.is_active === false) return [];
  if (typeof owner.email !== "string" || owner.email.trim() === "") return [];

  return [
    {
      userId: owner.id,
      email: owner.email,
      displayName:
        `${owner.last_name ?? ""}${owner.first_name ?? ""}`.trim() ||
        "ご担当者",
    },
  ];
}
