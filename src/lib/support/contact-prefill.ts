import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { formatResidence } from "@/lib/utils/format-residence";

/**
 * お問い合わせ（COM-008）の初期入力。
 *
 * ログイン中は、お問い合わせの種類に関係なく会員情報をフォームに最初から入れておく
 * （銀行振込を選んだ後に入るのでは、入力し終えた人には意味がないため）。
 * - 会社名／屋号: 発注者なら発注者情報の表示名（client_profiles.display_name）、
 *   それ以外は受注者プロフィールの会社名／屋号（users.company_name）。無ければ空
 * - 氏名: 姓名（スペースなし）
 * - メールアドレス: ログイン中のメール
 * - 所在地: 発注者なら発注者情報の所在地、それ以外はお住まい（都道府県 + 市区町村）
 * - 電話番号: 会員情報に無いため空（自分で入力）
 * すべて上書き可。
 */
export interface ContactPrefill {
  companyName: string;
  name: string;
  email: string;
  address: string;
}

export const EMPTY_CONTACT_PREFILL: ContactPrefill = {
  companyName: "",
  name: "",
  email: "",
  address: "",
};

export async function resolveContactPrefill(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ContactPrefill> {
  const [{ data: user }, { data: profile }] = await Promise.all([
    supabase
      .from("users")
      .select("email, last_name, first_name, company_name, prefecture, municipality, role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("client_profiles")
      .select("display_name, address")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!user) return EMPTY_CONTACT_PREFILL;

  const isClient = user.role === "client";
  const companyName =
    (isClient ? profile?.display_name?.trim() : null) || user.company_name?.trim() || "";
  const address =
    (isClient ? profile?.address?.trim() : null) ||
    formatResidence(user.prefecture, user.municipality) ||
    "";

  return {
    companyName,
    name: `${user.last_name ?? ""}${user.first_name ?? ""}`.trim(),
    email: user.email ?? "",
    address,
  };
}
