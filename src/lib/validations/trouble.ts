import { z } from "zod";

import { TROUBLE_CATEGORIES } from "@/lib/constants/trouble-options";

// ---------------------------------------------------------------------------
// Trouble report (COM-012) — client/server 共通スキーマ
// ---------------------------------------------------------------------------
// 添付ファイルはスキーマ対象外（サーバー処理側で file.size/file.type を直接検証）。

export const troubleReportSchema = z.object({
  reporterName: z.string().min(1, "氏名を入力してください"),
  counterpartyName: z.string().min(1, "トラブル相手の氏名を入力してください"),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("正しいメールアドレスを入力してください"),
  // トラブル種類（任意・単一選択）。空文字は未選択として許容
  category: z
    .string()
    .optional()
    .refine(
      (v) =>
        v === undefined ||
        v === "" ||
        (TROUBLE_CATEGORIES as readonly string[]).includes(v),
      "トラブル種類の値が不正です",
    ),
  content: z.string().min(1, "内容を入力してください"),
});

export type TroubleReportInput = z.infer<typeof troubleReportSchema>;
