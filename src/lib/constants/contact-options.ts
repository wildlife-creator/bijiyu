import { VIDEO_OPTION_UI_NAMES } from "@/lib/billing/options";
import { PAID_PLAN_TYPES, PLAN_LABELS } from "@/lib/constants/plans";

// ---------------------------------------------------------------------------
// Contact form options (COM-008)
// ---------------------------------------------------------------------------
// 値はラベル文字列で保存する。後から増減・改名・削除しても過去データは壊れない
// （Requirements 9.1-9.3）。将来 master テーブル化する場合もこの定数を起点にする。

/**
 * 銀行振込のお問い合わせ種類。
 * ログイン中の会員だけが選べる（フォームは未ログインに出さず、Server Action でも拒否）。
 * この種類のお問い合わせが ADM-025「銀行振込お問い合わせ一覧」に並ぶ。
 */
export const BANK_TRANSFER_INQUIRY_TYPE = "お支払い方法（銀行振込）について";

// お問い合わせ内容（必須・単一選択）
export const CONTACT_INQUIRY_TYPES = [
  "登録方法",
  "料金について",
  // 銀行振込は料金画面にボタンを出さず、問い合わせで受けて運営が有効化する
  BANK_TRANSFER_INQUIRY_TYPE,
  "仕事掲載",
  "協力会社募集",
  "職人募集",
  // 未払い発生前の相談窓口。発生後の当事者間トラブルはトラブル報告（COM-012）の「報酬未払い」
  "報酬未払いについて",
  "その他",
] as const;
export type ContactInquiryType = (typeof CONTACT_INQUIRY_TYPES)[number];

// ビジ友の利用目的（必須・単一選択）
export const CONTACT_PURPOSES = [
  "仕事を依頼したい",
  "協力会社を探したい",
  "職人として仕事を探したい",
  "元請けになりたい",
  "サービスを詳しく知りたい",
] as const;
export type ContactPurpose = (typeof CONTACT_PURPOSES)[number];

// 業種・職種（必須・単一選択）
// ※ profile の master_trade_types とは別の、問い合わせ分類用の簡易リスト。
//   user_skills.trade_type と紛らわしいため列名・定数名は industry とする。
export const CONTACT_INDUSTRIES = [
  "大工",
  "左官",
  "タイル",
  "電気",
  "設備",
  "内装",
  "解体",
  "外構",
  "塗装",
  "その他",
] as const;
export type ContactIndustry = (typeof CONTACT_INDUSTRIES)[number];

// 動画掲載の相談（任意・単一選択）
export const CONTACT_VIDEO_CONSULTATIONS = [
  "会社紹介動画を作りたい",
  "施工動画を掲載したい",
  "相談したい",
] as const;
export type ContactVideoConsultation =
  (typeof CONTACT_VIDEO_CONSULTATIONS)[number];

// ---------------------------------------------------------------------------
// 銀行振込の希望プラン
// ---------------------------------------------------------------------------
// お問い合わせの種類が BANK_TRANSFER_INQUIRY_TYPE のときだけ選ぶ（必須・単一選択）。
// contacts.bank_transfer_plan には **キー** を保存し、表示はここのラベルで行う
// （プラン名の改名に強い）。管理画面の「銀行振込」枠の有効化対象も同じ定数を使う。
// 補償（販売停止中）・急募（案件単位）は含めない。

export const BANK_TRANSFER_VIDEO_PLAN_KEYS = ["video", "video_shooting", "video_sns"] as const;

export type BankTransferVideoPlanKey = (typeof BANK_TRANSFER_VIDEO_PLAN_KEYS)[number];

export type BankTransferPlanKey =
  | (typeof PAID_PLAN_TYPES)[number]
  | BankTransferVideoPlanKey;

export const BANK_TRANSFER_PLAN_CHOICES: ReadonlyArray<{
  key: BankTransferPlanKey;
  label: string;
  kind: "plan" | "video";
}> = [
  ...PAID_PLAN_TYPES.map((key) => ({ key, label: PLAN_LABELS[key], kind: "plan" as const })),
  ...BANK_TRANSFER_VIDEO_PLAN_KEYS.map((key) => ({
    key,
    label: VIDEO_OPTION_UI_NAMES[key],
    kind: "video" as const,
  })),
];

export const BANK_TRANSFER_PLAN_KEYS: readonly BankTransferPlanKey[] =
  BANK_TRANSFER_PLAN_CHOICES.map((c) => c.key);

export function isBankTransferPlanKey(value: string): value is BankTransferPlanKey {
  return (BANK_TRANSFER_PLAN_KEYS as readonly string[]).includes(value);
}

/** 保存済みキー → 表示ラベル。未知のキー（将来の廃止等）はそのまま返す。 */
export function bankTransferPlanLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return BANK_TRANSFER_PLAN_CHOICES.find((c) => c.key === key)?.label ?? key;
}
