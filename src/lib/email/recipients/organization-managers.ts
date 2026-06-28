import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export interface OrgManagementRecipient {
  userId: string;
  email: string;
  /** 受信者名（姓 + 名 スペースなし結合、欠損時「ご担当者」フォールバック） */
  displayName: string;
}

/**
 * §5.2.A B-3: 組織管理層 (`org_role IN ('owner', 'admin')`) への M-03 broadcast 受信者リスト。
 *
 * §5.4.B / §5.6 / §5.7 / §5.7.5 の組織側 control mail でも再利用される共通ヘルパー。
 *
 * 除外仕様 (spec §5.2.A B-3 の必須除外フィルタを忠実に実装):
 *   - `users.deleted_at IS NULL` (退会済除外)
 *   - `users.is_active = true`   (法人プラン解約の連動凍結除外)
 *   - `email` が非空                (DB 異常時の防御)
 *   - `excludeUserIds` で個別除外 (§5.4.B で変更対象本人を外す等)
 *
 * 含める方針:
 *   - 操作者本人も対象 (操作のメール記録としての価値)
 *   - 招待中 (`password_set_at IS NULL`) の admin も対象 (後で内容確認可能)
 *
 * 0 名のケースは空配列を返す (best-effort、Server Action 側で成功扱い継続)。
 */
export async function getOrganizationManagementRecipients(
  admin: SupabaseClient<Database>,
  organizationId: string,
  excludeUserIds: string[] = [],
): Promise<OrgManagementRecipient[]> {
  // Step 1: 対象組織の owner / admin の user_id を取る
  const { data: members, error: memErr } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("org_role", ["owner", "admin"]);

  if (memErr || !members || members.length === 0) {
    return [];
  }

  const excludeSet = new Set(excludeUserIds);
  const candidateIds = members
    .map((m) => m.user_id)
    .filter((id) => !excludeSet.has(id));

  if (candidateIds.length === 0) return [];

  // Step 2: アクティブ + email 有り の users を取得
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
