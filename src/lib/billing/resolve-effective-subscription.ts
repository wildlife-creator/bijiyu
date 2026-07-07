import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActiveOrgContext } from "@/lib/organization/active-org-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * 操作者にとっての「実効サブスクリプション」を解決する。
 *
 * 法人プランでは Owner だけが契約主体で、Staff / Admin（org_role）は
 * 自分の subscription 行を持たず Owner のサブスクに相乗りする設計
 * （CLAUDE.md「Staff ユーザーの subscription 参照」/ REQ-ORG-011）。
 * Staff セッションは RLS で他者の subscriptions を SELECT 不可のため、
 * Owner の subscription を admin client 経由で取得する必要がある。
 *
 * 判定基準:
 *   active !== null && active.orgRole !== "owner"
 *     → 組織所属 & Owner ではない = Staff / Admin (org_role)
 *     → Owner の user_id + admin client で解決
 *   それ以外 = 個人ユーザー or Owner 本人
 *     → 操作者自身の user_id で通常クライアント経由
 *
 * 基準実装（本ヘルパー化前の重複コード）:
 *   - src/app/(authenticated)/layout.tsx（isStaffContext 分岐）
 *   - src/app/(authenticated)/mypage/page.tsx（staff 分岐）
 *
 * @param supabase - 通常の Supabase クライアント（getUser 済み）
 * @param userId - 操作者本人の auth.users.id
 * @param active - `getActiveOrganizationContext(supabase)` の `active`
 * @returns 有効な subscription（`{ status, plan_type }`）または null
 */
export async function resolveEffectiveSubscription(
  supabase: SupabaseClient<Database>,
  userId: string,
  active: ActiveOrgContext | null,
): Promise<{
  status: "active" | "past_due";
  plan_type: string;
} | null> {
  const shouldUseAdminForOwner =
    active !== null && active.orgRole !== "owner";

  if (shouldUseAdminForOwner) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("subscriptions")
      .select("status, plan_type")
      .eq("user_id", active.orgOwnerId)
      .in("status", ["active", "past_due"])
      .maybeSingle();
    return (data as { status: "active" | "past_due"; plan_type: string } | null) ?? null;
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("status, plan_type")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .maybeSingle();
  return (data as { status: "active" | "past_due"; plan_type: string } | null) ?? null;
}
