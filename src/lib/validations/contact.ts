import { z } from "zod";

import {
  CONTACT_INDUSTRIES,
  CONTACT_INQUIRY_TYPES,
  CONTACT_PURPOSES,
  CONTACT_VIDEO_CONSULTATIONS,
} from "@/lib/constants/contact-options";

// ---------------------------------------------------------------------------
// Contact (COM-008) — client/server 共通スキーマ
// ---------------------------------------------------------------------------
// 添付ファイルはスキーマ対象外（サーバー処理側で file.size/file.type を直接検証）。

// 必須の単一選択（許可リスト）
function requiredChoice(options: readonly string[], label: string) {
  return z
    .string()
    .min(1, `${label}を選択してください`)
    .refine((v) => options.includes(v), `${label}の値が不正です`);
}

// 任意の単一選択（空文字は未選択として許容、値があれば許可リスト照合）
function optionalChoice(options: readonly string[], label: string) {
  return z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || options.includes(v),
      `${label}の値が不正です`,
    );
}

export const contactSchema = z.object({
  // 基本情報
  companyName: z.string().min(1, "会社名／屋号を入力してください"),
  name: z.string().min(1, "氏名を入力してください"),
  phone: z.string().min(1, "電話番号を入力してください"),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("正しいメールアドレスを入力してください"),
  address: z.string().optional(),
  // お問い合わせについて
  inquiryType: requiredChoice(CONTACT_INQUIRY_TYPES, "お問い合わせ内容"),
  purpose: requiredChoice(CONTACT_PURPOSES, "ビジ友の利用目的"),
  industry: requiredChoice(CONTACT_INDUSTRIES, "業種・職種"),
  // 案件情報
  projectDescription: z.string().optional(),
  projectArea: z.string().optional(),
  // 動画掲載の相談
  videoConsultation: optionalChoice(
    CONTACT_VIDEO_CONSULTATIONS,
    "動画掲載の相談",
  ),
  // 詳細
  detail: z.string().min(1, "問い合わせ詳細を入力してください"),
});

export type ContactInput = z.infer<typeof contactSchema>;
