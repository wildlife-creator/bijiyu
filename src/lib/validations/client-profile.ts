import { z } from "zod";

/**
 * CLI-021（発注者情報編集）のフォームバリデーション。
 *
 * 設計選択（design.md 案 B）: 法人/非法人の 2 本構成。
 * - clientProfileSchema:        法人プラン用。display_name 必須
 * - clientProfilePersonalSchema: 非法人プラン用。display_name 任意
 * Server Action は Owner の plan_type に応じて使い分ける。
 */

const DISPLAY_NAME_MAX = 100;
const ADDRESS_MAX = 200;
const EMPLOYEE_SCALE_MIN = 1;
const EMPLOYEE_SCALE_MAX = 999_999;
const MESSAGE_MAX = 2000;

/**
 * null / undefined / 空文字 / 空白のみを「未入力」として null に正規化する
 * optional string スキーマ。非空入力は trim + max 長チェック。
 */
function optionalString(max: number, errorMessage: string) {
  return z.preprocess(
    (v) => (v === null || v === undefined ? "" : v),
    z.string().trim().max(max, errorMessage),
  ).transform((v) => (v ? v : null));
}

/**
 * 任意の整数（employee_scale 等）。null / undefined / NaN / 範囲外は null。
 */
function optionalInt(min: number, max: number) {
  return z.preprocess((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }, z.union([z.number().int().min(min).max(max), z.null()])).transform((v) =>
    typeof v === "number" ? v : null,
  );
}

// 共通フィールド定義（法人/非法人で display_name のみ差し替え）
const sharedFields = {
  address: optionalString(
    ADDRESS_MAX,
    `住所は${ADDRESS_MAX}文字以内で入力してください`,
  ),
  recruitJobTypes: z
    .array(z.string().trim().min(1))
    .min(1, "募集職種を選択してください"),
  recruitArea: z
    .array(z.string().trim().min(1))
    .min(1, "募集エリアを選択してください"),
  employeeScale: optionalInt(EMPLOYEE_SCALE_MIN, EMPLOYEE_SCALE_MAX),
  workingWay: optionalString(100, "求める働き方が長すぎます"),
  language: optionalString(100, "言語の入力が長すぎます"),
  message: optionalString(
    MESSAGE_MAX,
    `メッセージは${MESSAGE_MAX}文字以内で入力してください`,
  ),
  imageUrl: optionalString(500, "画像 URL が長すぎます"),
  snsX: z.boolean().default(false),
  snsInstagram: z.boolean().default(false),
  snsTiktok: z.boolean().default(false),
  snsYoutube: z.boolean().default(false),
  snsFacebook: z.boolean().default(false),
};

// 法人プラン: display_name 必須
export const clientProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "社名を入力してください")
    .max(
      DISPLAY_NAME_MAX,
      `社名は${DISPLAY_NAME_MAX}文字以内で入力してください`,
    ),
  ...sharedFields,
});

// 非法人プラン: display_name 任意（空も許可）
export const clientProfilePersonalSchema = z.object({
  displayName: optionalString(
    DISPLAY_NAME_MAX,
    `社名は${DISPLAY_NAME_MAX}文字以内で入力してください`,
  ),
  ...sharedFields,
});

export type ClientProfileInput = z.infer<typeof clientProfileSchema>;
export type ClientProfilePersonalInput = z.infer<
  typeof clientProfilePersonalSchema
>;

// Server Action に渡す共通型（法人/非法人の両方を受けられるように displayName を string | null に緩和）
export type ClientProfileFormInput = Omit<ClientProfileInput, "displayName"> & {
  displayName: string | null;
};

/**
 * プラン種別に応じてスキーマを選択する。
 */
export function selectClientProfileSchema(
  planType: string | null | undefined,
) {
  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";
  return isCorporate ? clientProfileSchema : clientProfilePersonalSchema;
}

// ============================================================
// 画像アップロード（CLI-021 の「画像を登録する」ボタン）
// ============================================================

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export const CLIENT_PROFILE_IMAGE_CONSTRAINTS = {
  maxSize: MAX_IMAGE_SIZE,
  allowedTypes: ALLOWED_IMAGE_TYPES,
} as const;
