import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * §7.2.B トラブル報告運営通知の【所属会社】行解決。
 *
 * - Owner（法人 client）: 自社 `client_profiles.display_name`
 * - Staff（代理 staff は N 法人兼任可）: 所属組織の Owner の `client_profiles.display_name` を全件 join
 * - 個人プラン client / contractor: null（行ごと省略）
 *
 * 複数件あれば「、」join、1 件なら単独 string、0 件なら null。
 *
 * 退会済 / 凍結中の組織を弾く `deleted_at IS NULL` を Owner 判定でも staff 判定でも適用する。
 */
export async function resolveReporterOrganizationName(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const names: string[] = [];

  // 1. Owner かチェック（owner_id でヒットすれば自社名を引く）
  const { data: ownedOrgs } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .is("deleted_at", null);

  if (ownedOrgs && ownedOrgs.length > 0) {
    const { data: profile } = await admin
      .from("client_profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const ownName = profile?.display_name?.trim();
    if (ownName) {
      names.push(ownName);
    }
  }

  // 2. Staff かチェック（organization_members を起点に、各組織 Owner の display_name を引く）
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);

  if (memberships && memberships.length > 0) {
    const orgIds = memberships.map((m) => m.organization_id);
    const { data: orgs } = await admin
      .from("organizations")
      .select("owner_id")
      .in("id", orgIds)
      .is("deleted_at", null);

    const ownerIds = (orgs ?? []).map((o) => o.owner_id);
    if (ownerIds.length > 0) {
      const { data: ownerProfiles } = await admin
        .from("client_profiles")
        .select("user_id, display_name")
        .in("user_id", ownerIds);

      for (const profile of ownerProfiles ?? []) {
        const trimmed = profile.display_name?.trim();
        if (trimmed && !names.includes(trimmed)) {
          names.push(trimmed);
        }
      }
    }
  }

  if (names.length === 0) return null;
  return names.join("、");
}
