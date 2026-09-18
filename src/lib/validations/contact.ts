import { z } from "zod";

import {
  BANK_TRANSFER_INQUIRY_TYPE,
  CONTACT_INDUSTRIES,
  CONTACT_INQUIRY_TYPES,
  CONTACT_PURPOSES,
  CONTACT_VIDEO_CONSULTATIONS,
  isBankTransferPlanKey,
} from "@/lib/constants/contact-options";

// ---------------------------------------------------------------------------
// Contact (COM-008) — client/server 共通スキーマ
// ---------------------------------------------------------------------------
// 添付ファイルはスキーマ対象外（サーバー処理側で file.size/file.type を直接検証）。
// 「銀行振込はログイン中だけ」の判定はセッションが要るためスキーマ外（Server Action）。

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

export const BANK_TRANSFER_PLAN_REQUIRED_MESSAGE = "希望プランを選択してください";

export const contactSchema = z
  .object({
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
    // 銀行振込の希望プラン（種類が銀行振込のときだけ必須、それ以外は空）
    bankTransferPlan: z.string().optional(),
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
  })
  .superRefine((data, ctx) => {
    const plan = data.bankTransferPlan ?? "";
    if (data.inquiryType === BANK_TRANSFER_INQUIRY_TYPE) {
      if (!plan) {
        ctx.addIssue({
          code: "custom",
          path: ["bankTransferPlan"],
          message: BANK_TRANSFER_PLAN_REQUIRED_MESSAGE,
        });
      } else if (!isBankTransferPlanKey(plan)) {
        ctx.addIssue({
          code: "custom",
          path: ["bankTransferPlan"],
          message: "希望プランの値が不正です",
        });
      }
    } else if (plan) {
      ctx.addIssue({
        code: "custom",
        path: ["bankTransferPlan"],
        message: "希望プランは銀行振込のお問い合わせでのみ選択できます",
      });
    }
  });

export type ContactInput = z.infer<typeof contactSchema>;
