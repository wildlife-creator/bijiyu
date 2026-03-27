import { z } from "zod";

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
    tradeType: z.string().min(1, "職種を選択してください"),
    rewardLower: z
      .number({ message: "報酬下限は数値で入力してください" })
      .int()
      .positive("報酬下限は正の数で入力してください"),
    rewardUpper: z
      .number({ message: "報酬上限は数値で入力してください" })
      .int()
      .positive("報酬上限は正の数で入力してください"),
    prefecture: z.string().min(1, "都道府県を選択してください"),
    address: z
      .string()
      .max(200, "詳細住所は200文字以内で入力してください")
      .optional()
      .or(z.literal("")),
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
    nationalityLanguage: z.string().max(200).optional().or(z.literal("")),
    items: z.string().max(500).optional().or(z.literal("")),
    scheduleDetail: z.string().max(2000).optional().or(z.literal("")),
    projectDetails: z.string().max(2000).optional().or(z.literal("")),
    ownerMessage: z.string().max(2000).optional().or(z.literal("")),
    location: z.string().max(500).optional().or(z.literal("")),
    etcMessage: z.string().max(2000).optional().or(z.literal("")),
    status: z.enum(["draft", "open", "closed"]),
  })
  .refine((data) => data.rewardUpper >= data.rewardLower, {
    message: "報酬上限は下限以上の値を入力してください",
    path: ["rewardUpper"],
  })
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
