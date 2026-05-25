import { z } from "zod";

import { parseVideoUrl } from "@/lib/video-embed";

/**
 * 動画 URL の Zod 検証スキーマ（video-display Task 3.3）。
 *
 * - 空文字 = 掲載停止（対応カラムを NULL 更新する運用、要件 2.6）→ 通過
 * - 非空 = parseVideoUrl 通過を必須とする（要件 2.3/2.4）
 * - クライアント（フォーム）とサーバー（Server Action）が同一スキーマを共有し
 *   二重防御する（要件 8.6）
 */
export const VideoUrlSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || parseVideoUrl(v) !== null, {
    message: "対応プラットフォームの URL を入力してください",
  });
