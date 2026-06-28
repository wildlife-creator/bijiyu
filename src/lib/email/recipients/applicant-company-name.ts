import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * §6.6 運営宛通知 (B-Ops / C-Ops) の【会社名】行解決ヘルパー。
 *
 * 解決順序:
 *   1. `client_profiles.display_name` (法人プラン Owner / staff の会社名)
 *   2. `users.company_name` (受注者・個人発注者の屋号)
 *   3. null (行ごと省略)
 *
 * 法人 staff / 代理 staff も Owner の client_profiles を参照する仕様だが、本ヘルパーは
 * **申込者本人の** client_profiles を引く (運営は申込操作者の会社所属を見たい)。
 * 申込者が staff の場合は staff 個人の client_profiles は無いため null フォールバック
 * (運営は users.company_name → admin 画面で組織情報を確認する想定)。
 */
export async function resolveApplicantCompanyName(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("users")
    .select("company_name, client_profiles(display_name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const profiles = data.client_profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  const displayName = profile?.display_name?.trim() ?? "";
  if (displayName !== "") return displayName;

  const companyName = (data.company_name ?? "").trim();
  if (companyName !== "") return companyName;

  return null;
}
