import { z } from "zod";

import { expandAreasForDb } from "@/lib/master/area-conversion";
import {
  areaErrorMessages,
  jobAreaRowsSchema,
} from "@/lib/validations/area";

// ---------------------------------------------------------------------------
// 日付の許容範囲（年の桁あふれ・非常識な値を防ぐ。UI の min/max と一致させる）
// ---------------------------------------------------------------------------
export const JOB_DATE_MIN = "2020-01-01";
export const JOB_DATE_MAX = "2099-12-31";
const JOB_DATE_RANGE_MESSAGE = "日付は2020年〜2099年の範囲で入力してください";

/**
 * 日付文字列が YYYY-MM-DD 形式かつ許容範囲内かを判定する。
 * 空欄 / undefined は「未入力」として true を返す（必須判定は min(1) 側が担う）。
 * 年が5桁以上（例: date input への 6 桁入力 "123456-01-01"）は正規表現で弾く。
 * ISO 形式はゼロ埋めのため辞書順比較がそのまま日付比較として成立する。
 */
function isJobDateInRange(value: string | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value >= JOB_DATE_MIN && value <= JOB_DATE_MAX;
}

// ---------------------------------------------------------------------------
// Job form validation schema
// ---------------------------------------------------------------------------
export const jobSchema = z
  .object({
    title: z
      .string()
      .min(1, "タイトルを入力してください")
      .max(100, "タイトルは100文字以内で入力してください"),
    description: z
      .string()
      .min(1, "案件詳細を入力してください")
      .max(5000, "案件詳細は5000文字以内で入力してください"),
    tradeTypes: z
      .array(z.string().trim().min(1))
      .min(1, "職種を1つ以上選択してください")
      .transform((arr) => Array.from(new Set(arr))),
    // 報酬下限は任意。空欄 (register valueAsNumber → NaN) と undefined の両方を許容
    rewardLower: z
      .number({ message: "報酬下限は数値で入力してください" })
      .int()
      .positive("報酬下限は正の数で入力してください")
      .optional()
      .or(z.nan()),
    rewardUpper: z
      .number({ message: "報酬上限は数値で入力してください" })
      .int()
      .positive("報酬上限は正の数で入力してください"),
    areas: jobAreaRowsSchema.refine((arr) => arr.length >= 1, {
      message: "エリアを1つ以上選択してください",
    }),
    // 工事全体の工期は任意入力
    projectStartDate: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
    projectEndDate: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
    workStartDate: z
      .string()
      .min(1, "稼働期間の開始日を選択してください")
      .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
    workEndDate: z
      .string()
      .min(1, "稼働期間の終了日を選択してください")
      .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
    recruitStartDate: z
      .string()
      .min(1, "応募受付の開始日を選択してください")
      .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
    recruitEndDate: z
      .string()
      .min(1, "応募受付の終了日を選択してください")
      .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
    headcount: z
      .number({ message: "募集人数は数値で入力してください" })
      .int()
      .positive("募集人数は正の数で入力してください"),
    workHours: z.string().max(200).optional().or(z.literal("")),
    experienceYears: z.string().max(100).optional().or(z.literal("")),
    requiredSkills: z.string().max(500).optional().or(z.literal("")),
    language: z
      .array(z.string().trim().min(1))
      .transform((arr) => Array.from(new Set(arr))),
    items: z.string().max(500).optional().or(z.literal("")),
    scheduleDetail: z.string().max(2000).optional().or(z.literal("")),
    projectDetails: z.string().max(2000).optional().or(z.literal("")),
    // 発注者からのメッセージは必須（UI の「必須」マーク・デザインカンプ CLI-004 と整合）
    ownerMessage: z
      .string()
      .min(1, "発注者からのメッセージを入力してください")
      .max(2000, "発注者からのメッセージは2000文字以内で入力してください"),
    status: z.enum(["draft", "open", "closed"]),
  })
  .refine(
    (data) => {
      // 下限未指定 (undefined / NaN) なら比較しない
      if (data.rewardLower === undefined || Number.isNaN(data.rewardLower)) {
        return true;
      }
      return data.rewardUpper >= data.rewardLower;
    },
    {
      message: "報酬上限は下限以上の値を入力してください",
      path: ["rewardUpper"],
    },
  )
  .refine(
    (data) => new Date(data.workEndDate) >= new Date(data.workStartDate),
    {
      message: "稼働期間の終了日は開始日以降を選択してください",
      path: ["workEndDate"],
    }
  )
  .refine(
    (data) =>
      new Date(data.recruitEndDate) >= new Date(data.recruitStartDate),
    {
      message: "応募受付の終了日は開始日以降を選択してください",
      path: ["recruitEndDate"],
    }
  )
  .refine(
    (data) => {
      // 工事全体の工期は任意。両方入力されたときのみ前後関係をチェック
      if (!data.projectStartDate || !data.projectEndDate) return true;
      return new Date(data.projectEndDate) >= new Date(data.projectStartDate);
    },
    {
      message: "工事全体の工期の終了日は開始日以降を選択してください",
      path: ["projectEndDate"],
    }
  );

export type JobFormValues = z.infer<typeof jobSchema>;

// ---------------------------------------------------------------------------
// Draft schema — only title is required, everything else is optional
// ---------------------------------------------------------------------------
export const jobDraftSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルを入力してください")
    .max(100, "タイトルは100文字以内で入力してください"),
  description: z.string().max(5000).optional().or(z.literal("")),
  tradeTypes: z
    .array(z.string().trim().min(1))
    .transform((arr) => Array.from(new Set(arr)))
    .default([]),
  rewardLower: z.number().int().positive().optional().or(z.nan()),
  rewardUpper: z.number().int().positive().optional().or(z.nan()),
  areas: z
    .array(
      z.object({
        prefecture: z.string(),
        whole: z.boolean(),
        municipalities: z.array(z.string()),
      }),
    )
    .default([])
    // 編集途中の空行 (prefecture 未選択) は draft 保存時に捨てる
    .transform((arr) => arr.filter((a) => a.prefecture.trim() !== ""))
    .refine((arr) => expandAreasForDb(arr).length <= 10, {
      message: areaErrorMessages.tooManyAreasForJob,
    }),
  projectStartDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
  projectEndDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
  workStartDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
  workEndDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
  recruitStartDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
  recruitEndDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(isJobDateInRange, JOB_DATE_RANGE_MESSAGE),
  headcount: z.number().int().positive().optional().or(z.nan()),
  workHours: z.string().max(200).optional().or(z.literal("")),
  experienceYears: z.string().max(100).optional().or(z.literal("")),
  requiredSkills: z.string().max(500).optional().or(z.literal("")),
  language: z
    .array(z.string().trim().min(1))
    .transform((arr) => Array.from(new Set(arr))),
  items: z.string().max(500).optional().or(z.literal("")),
  scheduleDetail: z.string().max(2000).optional().or(z.literal("")),
  projectDetails: z.string().max(2000).optional().or(z.literal("")),
  ownerMessage: z.string().max(2000).optional().or(z.literal("")),
  status: z.literal("draft"),
});

// ---------------------------------------------------------------------------
// Status transition whitelist
// ---------------------------------------------------------------------------
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["open"],
  open: ["closed"],
  closed: [],
};

// ---------------------------------------------------------------------------
// Image file validation
// ---------------------------------------------------------------------------
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;
/** direct-upload 後のストレージパス検証用 (ドット無し小文字) */
export const JOB_IMAGE_PATH_EXTENSIONS = ["jpg", "jpeg", "png"] as const;
const MAX_FILE_SIZE = 10_000_000; // 10MB
const MAX_IMAGES_PER_JOB = 10;

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

export function validateJobImageFile(file: File): string | null {
  if (
    !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
    return "JPEGまたはPNG形式の画像のみアップロードできます";
  }
  const ext = getFileExtension(file.name);
  if (
    !(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return "JPEGまたはPNG形式の画像のみアップロードできます";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "画像は1枚あたり10MB以下にしてください";
  }
  return null;
}

export function validateJobImageCount(
  existingCount: number,
  newCount: number
): string | null {
  if (existingCount + newCount > MAX_IMAGES_PER_JOB) {
    return "画像は1案件あたり最大10枚までアップロードできます";
  }
  return null;
}
