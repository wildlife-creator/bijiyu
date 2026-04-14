import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * 指定ユーザー群の「現在アクティブな法人プラン組織名」を解決する。
 *
 * データ保持ポリシー上、法人プラン → 個人プランへのダウングレード後も
 * organizations / organization_members のレコードは残る。しかし UI 表示では
 * 「現在法人プラン契約中」のユーザーだけ組織名を使いたいので、
 * subscriptions テーブルを参照して active な corporate / corporate_premium
 * ユーザーだけを対象にする。
 *
 * RLS 回避のため admin client を前提とする（Server Component 内で admin client を渡すこと）。
 *
 * 使い方:
 *   const admin = createAdminClient();
 *   const orgNameByUserId = await getActiveCorporateOrgNames(admin, userIds);
 *   const displayName = resolveParticipantName({
 *     organizationName: orgNameByUserId.get(user.id) ?? null,
 *     ...
 *   });
 */
export async function getActiveCorporateOrgNames(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;

  const [membersResult, subsResult] = await Promise.all([
    admin
      .from("organization_members")
      .select("user_id, organizations(name)")
      .in("user_id", userIds),
    admin
      .from("subscriptions")
      .select("user_id")
      .in("user_id", userIds)
      .eq("status", "active")
      .in("plan_type", ["corporate", "corporate_premium"]),
  ]);

  const activeCorpUserIds = new Set(
    (subsResult.data ?? []).map((s) => s.user_id),
  );

  for (const row of membersResult.data ?? []) {
    if (!activeCorpUserIds.has(row.user_id)) continue;
    const orgName = (row as unknown as { organizations?: { name?: string | null } | null })
      ?.organizations?.name;
    if (orgName) {
      result.set(row.user_id, orgName);
    }
  }

  return result;
}
