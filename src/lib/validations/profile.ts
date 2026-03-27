import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared file validation helpers
// ---------------------------------------------------------------------------
const ALLOWED_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png"] as const;

const ALLOWED_DOCUMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"] as const;
const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

// ---------------------------------------------------------------------------
// Profile edit (COM-002)
// ---------------------------------------------------------------------------
const skillSchema = z.object({
  tradeType: z.string().min(1, "職種を選択してください"),
  experienceYears: z.number({ error: "経験年数は数値で入力してください" }),
});

export const profileEditSchema = z.object({
  lastName: z.string().min(1, "姓を入力してください"),
  firstName: z.string().min(1, "名を入力してください"),
  gender: z.string().min(1, "性別を選択してください"),
  birthDate: z.string().min(1, "生年月日を入力してください"),
  email: z
    .string()
    .email("正しいメールアドレスを入力してください")
    .optional()
    .or(z.literal("")),
  prefecture: z.string().min(1, "都道府県を選択してください"),
  companyName: z.string().optional(),
  bio: z.string().optional(),
  skills: z
    .array(skillSchema)
    .min(1, "職種を1つ以上追加してください")
    .max(3, "職種は3つまで登録できます"),
  qualifications: z.array(z.string()).optional().default([]),
  availableAreas: z
    .array(z.string().min(1))
    .min(1, "対応エリアを1つ以上選択してください"),
});
export type ProfileEditInput = z.infer<typeof profileEditSchema>;

// ---------------------------------------------------------------------------
// Avatar upload (COM-002)
// ---------------------------------------------------------------------------
export function validateAvatarFile(file: File): string | null {
  if (file.size > 5_000_000) {
    return "ファイルサイズは5MB以下にしてください";
  }
  if (
    !(ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
    return "JPEG、PNG形式のファイルをアップロードしてください";
  }
  const ext = getFileExtension(file.name);
  if (
    !(ALLOWED_AVATAR_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return "JPEG、PNG形式のファイルをアップロードしてください";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Document upload validation (COM-004 / COM-005)
// ---------------------------------------------------------------------------
export function validateDocumentFile(file: File): string | null {
  if (file.size > 10_000_000) {
    return "ファイルサイズは10MB以下にしてください";
  }
  if (
    !(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
    return "JPEG、PNG、PDF形式のファイルをアップロードしてください";
  }
  const ext = getFileExtension(file.name);
  if (
    !(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return "JPEG、PNG、PDF形式のファイルをアップロードしてください";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Identity upload (COM-004)
// ---------------------------------------------------------------------------
export const identityUploadSchema = z.object({
  document1: z.instanceof(File, { message: "書類1を選択してください" }),
  document2: z.instanceof(File, { message: "書類2を選択してください" }),
});
export type IdentityUploadInput = z.infer<typeof identityUploadSchema>;

// ---------------------------------------------------------------------------
// CCUS upload (COM-005)
// ---------------------------------------------------------------------------
export const ccusUploadSchema = z.object({
  document: z.instanceof(File, { message: "書類を選択してください" }),
  ccusWorkerId: z
    .string()
    .min(1, "CCUS技能者IDを入力してください"),
});
export type CcusUploadInput = z.infer<typeof ccusUploadSchema>;

// ---------------------------------------------------------------------------
// Withdrawal (COM-006)
// ---------------------------------------------------------------------------
export const withdrawalSchema = z.object({
  reason: z.string().min(1, "退会理由を選択してください"),
  details: z.string().optional(),
  confirmed: z.literal(true, { error: "同意チェックが必要です" }),
});
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;

// ---------------------------------------------------------------------------
// Contact (COM-008)
// ---------------------------------------------------------------------------
export const contactSchema = z.object({
  lastName: z.string().min(1, "姓を入力してください"),
  firstName: z.string().min(1, "名を入力してください"),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("正しいメールアドレスを入力してください"),
  contactTypes: z
    .array(z.string())
    .min(1, "お問い合わせ項目を選択してください"),
  content: z.string().min(1, "内容を入力してください"),
});
export type ContactInput = z.infer<typeof contactSchema>;
