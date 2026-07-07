import type { createClient } from "@/lib/supabase/server";

/**
 * 無料 contractor が今月中に作成できる新規スレッド数の上限。
 * 有料ユーザー（subscription active/past_due, role=client/staff）は制限対象外。
 */
export const MONTHLY_NEW_THREAD_LIMIT = 5;

/**
 * 無料 contractor の新規スレッド作成が月次上限を超えているか判定する。
 * 有料ユーザーは常に false を返す。
 *
 * 判定基準:
 *   - subscription が active/past_due で存在 → 制限なし
 *   - users.role が 'client' または 'staff' → 制限なし
 *   - 上記いずれでもない場合: 今月 participant_1_id = userId で作成された
 *     message_threads を JST 月初以降でカウントし、5 件以上なら true
 *
 * 注: 「今月」は JST 月初（YYYY-MM-01T00:00:00+09:00）以降で判定。
 * サーバー UTC 時計との齟齬で「JST では月内なのに UTC では前月末」を
 * 弾かないよう `toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })` で
 * JST の年月を取り出してから月初を組み立てる。
 */
export async function isMonthlyNewThreadLimitExceeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .limit(1)
    .maybeSingle();
  if (sub) return false;

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (userData?.role === "staff" || userData?.role === "client") return false;

  const jstMonthStart = new Date(
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })
      .slice(0, 7) + "-01T00:00:00+09:00",
  ).toISOString();

  const { count } = await supabase
    .from("message_threads")
    .select("*", { count: "exact", head: true })
    .eq("participant_1_id", userId)
    .gte("created_at", jstMonthStart);
  return (count ?? 0) >= MONTHLY_NEW_THREAD_LIMIT;
}
