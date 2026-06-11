import { z } from "zod";

import { WORKING_WAYS } from "@/lib/constants/options";
import { areaRowsSchema } from "@/lib/validations/area";

/**
 * CLI-021（発注者情報編集）のフォームバリデーション。
 *
 * 設計選択（design.md 案 B）: 法人/非法人の 2 本構成。
 * - clientProfileSchema:        法人プラン用。display_name 必須
 * - clientProfilePersonalSchema: 非法人プラン用。display_name 任意
 * Server Action は Owner の plan_type に応じて使い分ける。
 *
 * billing Task 17（2026-06-10 仕様変更⑤・2026-06-11 改訂）:
 * 募集職種・募集エリアは mode でも切り替える。
 * - setup（課金直後の初回設定）: 未入力可（招待法人が社名だけで即スタートできるように）
 * - edit（通常編集）: 従来どおり必須（最終的には全発注者に登録してもらう方針）
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

// 共通フィールド定義（法人/非法人で display_name、setup/edit で募集職種・エリアを差し替え）
const sharedFields = {
  address: optionalString(
    ADDRESS_MAX,
    `住所は${ADDRESS_MAX}文字以内で入力してください`,
  ),
  employeeScale: optionalInt(EMPLOYEE_SCALE_MIN, EMPLOYEE_SCALE_MAX),
  workingWay: z
    .array(z.enum(WORKING_WAYS))
    .transform((arr) => Array.from(new Set(arr))),
  language: z
    .array(z.string().trim().min(1))
    .transform((arr) => Array.from(new Set(arr))),
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

// 募集職種・募集エリア: edit = 必須 / setup = 未入力可
function recruitFields(mode: ClientProfileMode) {
  const recruitJobTypesBase = z
    .array(z.string().trim().min(1))
    .transform((arr) => Array.from(new Set(arr)));
  if (mode === "setup") {
    return {
      recruitJobTypes: recruitJobTypesBase,
      recruitArea: areaRowsSchema,
    };
  }
  return {
    recruitJobTypes: z
      .array(z.string().trim().min(1))
      .min(1, "募集職種を選択してください")
      .transform((arr) => Array.from(new Set(arr))),
    recruitArea: areaRowsSchema.refine((arr) => arr.length >= 1, {
      message: "募集エリアを選択してください",
    }),
  };
}

export type ClientProfileMode = "edit" | "setup";

// 法人プラン: display_name 必須
const corporateDisplayName = z
  .string()
  .trim()
  .min(1, "社名を入力してください")
  .max(DISPLAY_NAME_MAX, `社名は${DISPLAY_NAME_MAX}文字以内で入力してください`);

// 非法人プラン: display_name 任意（空も許可）
const personalDisplayName = optionalString(
  DISPLAY_NAME_MAX,
  `社名は${DISPLAY_NAME_MAX}文字以内で入力してください`,
);

// 通常編集（edit）: 募集職種・募集エリア必須
export const clientProfileSchema = z.object({
  displayName: corporateDisplayName,
  ...sharedFields,
  ...recruitFields("edit"),
});

export const clientProfilePersonalSchema = z.object({
  displayName: personalDisplayName,
  ...sharedFields,
  ...recruitFields("edit"),
});

// 課金直後の初回設定（setup）: 募集職種・募集エリア未入力可
export const clientProfileSetupSchema = z.object({
  displayName: corporateDisplayName,
  ...sharedFields,
  ...recruitFields("setup"),
});

export const clientProfilePersonalSetupSchema = z.object({
  displayName: personalDisplayName,
  ...sharedFields,
  ...recruitFields("setup"),
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
 * プラン種別と画面モードに応じてスキーマを選択する。
 * - 法人（corporate / corporate_premium）: 社名必須
 * - setup: 募集職種・募集エリア未入力可 / edit: 必須
 */
export function selectClientProfileSchema(
  planType: string | null | undefined,
  mode: ClientProfileMode = "edit",
) {
  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";
  if (mode === "setup") {
    return isCorporate
      ? clientProfileSetupSchema
      : clientProfilePersonalSetupSchema;
  }
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
