/**
 * 課金オプションの正準型（video-display Task 3.4）。
 *
 * 既存リテラルを 1 箇所に集約する single source of truth。
 * priceIdForOption / 各 Zod schema / webhook 分岐がこの型を再利用することで、
 * 新オプション追加・リテラル typo がコンパイルで捕捉される。
 */

/** 正準 option_type union（要件 8.1）。 */
export type OptionType =
  | "video" // 受注者PR動画（据置）
  | "video_workplace" // 職場紹介動画（新規）
  | "video_shooting" // ユーザー撮影プラン（P7、2026-09。ユーザーが撮った素材を運営が編集・掲載）
  | "urgent"
  | "compensation_5000"
  | "compensation_9800";

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
  video_shooting: "ユーザー撮影プラン",
};

/**
 * オプション価格（税込 JPY）。Stripe の Price と一致させること
 * （STRIPE_PRICE_VIDEO / STRIPE_PRICE_VIDEO_WORKPLACE / STRIPE_PRICE_VIDEO_SHOOTING /
 *   STRIPE_PRICE_URGENT / STRIPE_PRICE_COMPENSATION_5000 / STRIPE_PRICE_COMPENSATION_9800）。
 * 銀行振込（P2）の申込金額と、料金プラン画面の表示に使う。補償は月額。
 */
export const OPTION_PRICES_TAX_INCLUDED: Record<OptionType, number> = {
  video: 100000,
  video_workplace: 100000,
  video_shooting: 20000,
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
 * 買い切り・期限なしの動画系オプション（購入後は運営が動画を制作 / 編集して掲載する 2 ステップ）。
 * Checkout / Webhook / 銀行振込の有効化 / メールはこの 3 種を同じ経路で扱う。
 * 表示側の出し分けには使わない（P4 で表示ゲートは撤廃済み）。
 */
export const VIDEO_OPTION_TYPES = [
  "video",
  "video_workplace",
  "video_shooting",
] as const satisfies readonly OptionType[];

export type VideoOptionType = (typeof VIDEO_OPTION_TYPES)[number];

export function isVideoOption(optionType: string): optionType is VideoOptionType {
  return (VIDEO_OPTION_TYPES as readonly string[]).includes(optionType);
}
