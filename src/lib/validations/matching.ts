import { z } from "zod";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 受注者側の稼働状況（6選択肢）
export const CONTRACTOR_OPERATING_STATUS_OPTIONS = [
  "問題なく稼働完了",
  "一部欠席したものの概ね問題なく稼働完了",
  "欠席（連絡あり）",
  "欠席（連絡なし）",
  "発注者側からお断り",
  "その他",
] as const;

// 稼働状況 → applications.status のマッピング
export function mapOperatingStatusToApplicationStatus(
  operatingStatus: string,
): "completed" | "lost" {
  if (
    operatingStatus === "問題なく稼働完了" ||
    operatingStatus === "一部欠席したものの概ね問題なく稼働完了"
  ) {
    return "completed";
  }
  return "lost";
}

const contractorOperatingStatusEnum = z.enum(
  CONTRACTOR_OPERATING_STATUS_OPTIONS,
  { message: "稼働状況を選択してください" },
);

// 発注者側の稼働状況（CLI-012 用、受注者側と同じ6選択肢）
const clientOperatingStatusEnum = z.enum(CONTRACTOR_OPERATING_STATUS_OPTIONS, {
  message: "稼働状況を選択してください",
});

const ratingEnum = z.enum(["good", "bad"], {
  message: "評価を選択してください",
});

// 受注者 完了報告 + 発注者評価スキーマ (CON-013)
export const contractorReportSchema = z.object({
  applicationId: z.string().regex(uuidRegex, "応募IDが不正です"),
  operatingStatus: contractorOperatingStatusEnum,
  statusSupplement: z.string().optional(),
  ratingAgain: ratingEnum,
  comment: z.string().optional(),
});

// rating-redesign: ★×5 評価（1〜5 整数）。FormData の数値文字列を coerce で受ける。
const starRatingSchema = z.coerce
  .number()
  .int()
  .min(1, "1〜5で評価してください")
  .max(5, "1〜5で評価してください");

// 任意項目: 空文字/undefined は null 扱い（未評価）
const optionalStarRatingSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  starRatingSchema.nullable(),
);

// 発注者 完了報告 + 受注者評価スキーマ (CLI-012)
// rating-redesign: 7項目★×5（総合評価のみ必須、他6項目は任意 = nullable）
export const clientReportSchema = z.object({
  applicationId: z.string().regex(uuidRegex, "応募IDが不正です"),
  operatingStatus: clientOperatingStatusEnum,
  statusSupplement: z.string().optional(),
  ratingOverall: starRatingSchema,
  ratingPunctual: optionalStarRatingSchema,
  ratingFollowsInstructions: optionalStarRatingSchema,
  ratingSpeed: optionalStarRatingSchema,
  ratingQuality: optionalStarRatingSchema,
  ratingHasTools: optionalStarRatingSchema,
  ratingHasSpecialEquipment: optionalStarRatingSchema,
  comment: z.string().optional(),
});

// 発注承認スキーマ (CLI-009)
export const acceptApplicationSchema = z.object({
  applicationId: z.string().regex(uuidRegex, "応募IDが不正です"),
  workLocation: z.string().min(1, "勤務地を入力してください"),
  clientNotes: z.string().optional(),
  firstWorkDate: z
    .string()
    .min(1, "初回稼働日を入力してください")
    .refine(
      (val) => !isNaN(Date.parse(val)),
      "有効な日付を入力してください",
    ),
});

// お断りスキーマ (CLI-009-C)
export const rejectApplicationSchema = z.object({
  applicationId: z.string().regex(uuidRegex, "応募IDが不正です"),
  rejectionReason: z.string().optional(),
});
