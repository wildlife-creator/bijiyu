import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BODY_LENGTH = 5000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];

export const messageSchema = z.object({
  body: z
    .string()
    .min(1, "メッセージを入力してください")
    .max(MAX_BODY_LENGTH, `メッセージは${MAX_BODY_LENGTH}文字以内で入力してください`),
  image: z
    .instanceof(File)
    .refine(
      (file) => file.size <= MAX_IMAGE_SIZE,
      "画像は10MB以下にしてください",
    )
    .refine(
      (file) => ALLOWED_IMAGE_TYPES.includes(file.type),
      "画像はJPEGまたはPNG形式のみ対応しています",
    )
    .optional(),
});

export const scoutSchema = z.object({
  userId: z.string().regex(UUID_REGEX, "ユーザーIDが不正です"),
  jobId: z.string().regex(UUID_REGEX, "案件IDが不正です"),
  title: z.string().min(1, "タイトルを入力してください"),
  body: z
    .string()
    .min(1, "本文を入力してください")
    .max(MAX_BODY_LENGTH, `本文は${MAX_BODY_LENGTH}文字以内で入力してください`),
});

export const bulkMessageSchema = z.object({
  recipientIds: z
    .array(z.string().regex(UUID_REGEX, "ユーザーIDが不正です"))
    .min(1, "送信先を1名以上選択してください"),
  body: z
    .string()
    .min(1, "メッセージを入力してください")
    .max(MAX_BODY_LENGTH, `メッセージは${MAX_BODY_LENGTH}文字以内で入力してください`),
});
