import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * @deprecated
 *
 * 発注者表示名の解決は `client_profiles.display_name` 一本化に移行した。
 * 本関数は organization spec の Task 3.2 で論理削除済み。Task 4.1〜4.4
 * で呼び出し側 14 ファイルが `resolveClientProfileForRow()` +
 * standard query pattern に移行された時点で物理削除する
 * （本ファイルとユニットテスト `src/__tests__/utils/resolve-org-names.test.ts`
 * の両方を Task 16 / Task 17 到達時に削除予定）。
 *
 * 新規コードから本関数を呼ばないこと。代わりに
 * `src/lib/utils/display-name.ts` の `resolveClientProfileForRow()` と
 * `resolveParticipantName()` を使う。
 *
 * 下記の既存実装は後方互換のために残す（動作は Phase 1 まで温存）。
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
