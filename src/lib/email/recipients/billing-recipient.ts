import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * §6 系課金メールの受信者解決ヘルパー。
 *
 * 解決順序（M-03 / `resolveParticipantName()` と同方針）:
 *   1. `client_profiles.display_name` (社名・屋号など、CLI-021 で入力)
 *   2. `users.last_name + first_name` (スペースなし結合)
 *   3. 「お客様」フォールバック
 *
 * 退会済 / `is_active = false` チェックは呼出側の責務。本ヘルパーは email + 名前を引くだけ。
 * SELECT 結果が無ければ null を返し、呼出側でメール送信を skip する想定。
 */
export async function fetchBillingRecipient(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const result = await admin
    .from("users")
    .select("email, last_name, first_name, client_profiles(display_name)")
    .eq("id", userId)
    .maybeSingle();
  if (!result.data) return null;
  const profiles = result.data.client_profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  const displayName = profile?.display_name?.trim() ?? "";
  const personalName = `${result.data.last_name ?? ""}${result.data.first_name ?? ""}`;
  const name = displayName || personalName || "お客様";
  return { email: result.data.email, name };
}

/** YYYY/MM/DD 形式。ISO 文字列を受け取り「—」を null フォールバックに使う。 */
export function formatBillingDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

/** YYYY/MM/DD HH:MM 形式。OPS 通知の【申込日時】で使用（分単位）。 */
export function formatBillingDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}
