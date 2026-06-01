import { z } from "zod";

import { INQUIRY_TOPICS } from "@/lib/constants/job-inquiry-options";

// ---------------------------------------------------------------------------
// Job inquiry (求人へのお問い合わせ / COM-013) — client/server 共通スキーマ
// ---------------------------------------------------------------------------
// エラーメッセージは日本語固定文言。react-hook-form（クライアント）と
// Server Action（サーバー）で同一スキーマを再利用する。

export const jobInquirySchema = z.object({
  name: z
    .string()
    .min(1, "氏名を入力してください")
    .max(100, "氏名は100文字以内で入力してください"),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません"),
  topics: z
    .array(z.enum(INQUIRY_TOPICS))
    .min(1, "お問い合わせ項目を選択してください"),
  content: z
    .string()
    .max(2000, "お問い合わせ内容は2000文字以内で入力してください")
    .optional()
    .default(""),
});

export type JobInquiryInput = z.infer<typeof jobInquirySchema>;
