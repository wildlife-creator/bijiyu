/**
 * 課金オプションの正準型（video-display Task 3.4）。
 *
 * 既存リテラルを 1 箇所に集約する single source of truth。
 * priceIdForOption / 各 Zod schema / webhook 分岐がこの型を再利用することで、
 * 新オプション追加・リテラル typo がコンパイルで捕捉される。
 */

/** 正準 option_type union（要件 8.1）。 */
export type OptionType =
  | "video" // プロフィール動画制作プラン（P10 で旧「自己PR動画」「職場紹介動画」を統合。新規販売はこのキーのみ）
  | "video_workplace" // 旧 職場紹介動画（P10、2026-09 で新規販売停止。既存行・Webhook・管理画面は維持）
  | "video_shooting" // ユーザー撮影プラン（P7、2026-09。ユーザーが撮った素材を運営が編集・掲載）
  | "video_sns" // ビジ友公式SNS動画制作プラン（P10、2026-09。運営が撮影・編集し公式 SNS に掲載）
  | "urgent"
  | "compensation_5000"
  | "compensation_9800";

/**
 * オプション表示ラベル（メール本文・UI 共用、§6.5 / §6.6 の【お申し込みオプション】行で使用）。
 *
 * 補償系は「金額 + 補償上限」を一括で表す慣用表現に合わせる。動画系は料金プラン画面の商品名から
 * 「〜制作プラン」を除いた短縮名（P10 で統一）、急募は「急募オプション」。
 */
export const OPTION_LABELS: Record<OptionType, string> = {
  compensation_5000: "補償（5,000円/月、最大200万円）",
  compensation_9800: "補償（9,800円/月、最大500万円）",
  urgent: "急募オプション",
  video: "プロフィール動画",
  video_workplace: "プロフィール動画（旧: 職場紹介動画）",
  video_shooting: "ユーザー撮影プラン",
  video_sns: "ビジ友公式SNS動画",
};

/**
 * オプション価格（税込 JPY）。Stripe の Price と一致させること
 * （STRIPE_PRICE_VIDEO / STRIPE_PRICE_VIDEO_WORKPLACE / STRIPE_PRICE_VIDEO_SHOOTING / STRIPE_PRICE_VIDEO_SNS /
 *   STRIPE_PRICE_URGENT / STRIPE_PRICE_COMPENSATION_5000 / STRIPE_PRICE_COMPENSATION_9800）。
 * 銀行振込（P2）の申込金額と、料金プラン画面の表示に使う。補償は月額。
 */
export const OPTION_PRICES_TAX_INCLUDED: Record<OptionType, number> = {
  video: 100000,
  video_workplace: 100000,
  video_shooting: 20000,
  video_sns: 120000,
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
 * 補償オプション（compensation_5000 / 9800）の販売フラグ（P8、spec-changes-202608 §2.6）。
 *
 * 補償は保険会社との別契約に切り出す方針となり、アプリ上での販売を取り下げた。
 * コードは削除せず、環境変数 NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED が "true" のときだけ
 * 料金プラン画面に表示し、Stripe Checkout / 銀行振込の新規申込を受け付ける（未設定 = 販売停止）。
 * 加入中の契約の表示・解約、Webhook・メール・管理画面はこのフラグに関係なく動く。
 */
export function isCompensationOptionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED === "true";
}

export const COMPENSATION_OPTION_DISABLED_MESSAGE =
  "補償オプションは現在お申し込みを受け付けていません";

export function isCompensationOption(
  optionType: string,
): optionType is "compensation_5000" | "compensation_9800" {
  return optionType === "compensation_5000" || optionType === "compensation_9800";
}

/**
 * 買い切り・期限なしの動画系オプション（購入後は運営が動画を制作 / 編集して掲載する 2 ステップ）。
 * Checkout / Webhook / 銀行振込の有効化 / メールはこの 4 種を同じ経路で扱う。
 * 表示側の出し分けには使わない（P4 で表示ゲートは撤廃済み）。
 */
export const VIDEO_OPTION_TYPES = [
  "video",
  "video_workplace",
  "video_shooting",
  "video_sns",
] as const satisfies readonly OptionType[];

export type VideoOptionType = (typeof VIDEO_OPTION_TYPES)[number];

export function isVideoOption(optionType: string): optionType is VideoOptionType {
  return (VIDEO_OPTION_TYPES as readonly string[]).includes(optionType);
}

/**
 * 新規販売を停止したオプション（P10、2026-09。docs/requirements/video-plans-handoff-202609.md §4）。
 *
 * 旧「職場紹介動画」（video_workplace）は「プロフィール動画制作プラン」（video）に統合した。
 * 料金プラン画面から行を消すだけでなく、Stripe Checkout / 銀行振込の本人申込 / 運営の代理登録の
 * 3 入口すべてで拒否する（画面から消しても Server Action は直接呼べるため）。
 * 既存の契約行・Webhook・ADM-026 の有効化・メール・管理画面の表示はこの判定に関係なく動く。
 */
export const DISCONTINUED_OPTION_TYPES: readonly OptionType[] = ["video_workplace"];

export function isDiscontinuedOption(optionType: string): boolean {
  return (DISCONTINUED_OPTION_TYPES as readonly string[]).includes(optionType);
}

export const DISCONTINUED_OPTION_MESSAGE =
  "このオプションは「プロフィール動画制作プラン」に統合されました。プロフィール動画制作プランからお申し込みください";

/**
 * 管理画面の絞り込み「プロフィール動画」で対象にする option_type。
 * 統合前に購入された video_workplace 行も同じ商品として扱う（ADM-003 / ADM-008 / ADM-004）。
 */
export const PROFILE_VIDEO_OPTION_TYPES: readonly OptionType[] = ["video", "video_workplace"];
