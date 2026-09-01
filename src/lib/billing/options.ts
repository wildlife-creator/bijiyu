import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * 課金オプションの正準型と active 判定ヘルパー（video-display Task 3.4）。
 *
 * 既存リテラルを 1 箇所に集約する single source of truth。
 * priceIdForOption / 各 Zod schema / webhook 分岐がこの型を再利用することで、
 * 新オプション追加・リテラル typo がコンパイルで捕捉される。
 */

/** 正準 option_type union（要件 8.1）。 */
export type OptionType =
  | "video" // 受注者PR動画（据置）
  | "video_workplace" // 職場紹介動画（新規）
  | "urgent"
  | "compensation_5000"
  | "compensation_9800";

/** 動画オプションのみのサブセット（表示判定で使用）。 */
export type VideoOptionType = Extract<OptionType, "video" | "video_workplace">;

/**
 * オプション表示ラベル（メール本文・UI 共用、§6.5 / §6.6 の【お申し込みオプション】行で使用）。
 *
 * 補償系は「金額 + 補償上限」を一括で表す慣用表現に合わせる。動画系は「受注者PR動画」「職場紹介動画」
 * の正式名称、急募は「急募オプション」。
 */
export const OPTION_LABELS: Record<OptionType, string> = {
  compensation_5000: "補償（5,000円/月、最大200万円）",
  compensation_9800: "補償（9,800円/月、最大500万円）",
  urgent: "急募オプション",
  video: "受注者PR動画",
  video_workplace: "職場紹介動画",
};

/**
 * オプション価格（税込 JPY）。Stripe の Price と一致させること
 * （STRIPE_PRICE_VIDEO / STRIPE_PRICE_VIDEO_WORKPLACE / STRIPE_PRICE_URGENT /
 *   STRIPE_PRICE_COMPENSATION_5000 / STRIPE_PRICE_COMPENSATION_9800）。
 * 銀行振込（P2）の申込金額と、料金プラン画面の表示に使う。補償は月額。
 */
export const OPTION_PRICES_TAX_INCLUDED: Record<OptionType, number> = {
  video: 100000,
  video_workplace: 100000,
  urgent: 20000,
  compensation_5000: 5000,
  compensation_9800: 9800,
};

/** 月額課金型（subscription）のオプション。それ以外は買い切り（one_time）。 */
export const SUBSCRIPTION_OPTION_TYPES: readonly OptionType[] = [
  "compensation_5000",
  "compensation_9800",
];

export function isSubscriptionOption(optionType: OptionType): boolean {
  return SUBSCRIPTION_OPTION_TYPES.includes(optionType);
}

/**
 * 指定ユーザーが指定 option_type の active レコードを持つか判定する。
 *
 * - status='active' のみ true。'cancelled'/'expired' は（DB 側フィルタで除外され）false。
 * - **client を引数化**: 自分自身の option は通常 or admin client、CLI-006/CON-006 の
 *   ような cross-user 参照では RLS 制約のため **admin（service-role）client** を渡すこと。
 *   通常 client で他ユーザーの option を引くと RLS で空 → 常に false の静かなバグになる。
 * - error / data=null はフェイルセーフで false（動画を出さない方が安全）。
 *
 * @returns active レコードが 1 件以上あれば true
 */
export async function hasActiveOption(
  client: SupabaseClient<Database>,
  userId: string,
  optionType: VideoOptionType,
): Promise<boolean> {
  const { data, error } = await client
    .from("option_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("option_type", optionType)
    .eq("status", "active")
    .limit(1);

  if (error || !data) return false;
  return data.length > 0;
}
