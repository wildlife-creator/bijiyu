import { z } from "zod";

import { expandAreasForDb } from "@/lib/master/area-conversion";
import {
  areaErrorMessages,
  jobAreaRowsSchema,
} from "@/lib/validations/area";

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
    workStartDate: z.string().min(1, "工期開始日を選択してください"),
    workEndDate: z.string().min(1, "工期終了日を選択してください"),
    recruitStartDate: z.string().min(1, "募集開始日を選択してください"),
    recruitEndDate: z.string().min(1, "募集終了日を選択してください"),
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
    ownerMessage: z.string().max(2000).optional().or(z.literal("")),
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
      message: "工期終了日は開始日以降を選択してください",
      path: ["workEndDate"],
    }
  )
  .refine(
    (data) =>
      new Date(data.recruitEndDate) >= new Date(data.recruitStartDate),
    {
      message: "募集終了日は開始日以降を選択してください",
      path: ["recruitEndDate"],
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
  workStartDate: z.string().optional().or(z.literal("")),
  workEndDate: z.string().optional().or(z.literal("")),
  recruitStartDate: z.string().optional().or(z.literal("")),
  recruitEndDate: z.string().optional().or(z.literal("")),
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
