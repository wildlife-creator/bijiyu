import { z } from "zod";

import { parseVideoUrl } from "@/lib/video-embed";
import {
  VIDEO_ADMIN_LABEL_MAX_LENGTH,
  VIDEO_PLACEMENTS,
} from "@/lib/videos/constants";

/**
 * 動画管理（ADM-027）の Zod 検証スキーマ。クライアント（フォーム）とサーバー
 * （Server Action）が同一スキーマを共有して二重防御する。
 */

export const VIDEO_URL_ERROR_MESSAGE =
  "対応プラットフォームの URL を入力してください";

/** URL 貼り付けで追加する動画の URL。空は不可、parseVideoUrl 通過が必須。 */
export const ExternalVideoUrlSchema = z
  .string()
  .trim()
  .min(1, VIDEO_URL_ERROR_MESSAGE)
  .refine((v) => parseVideoUrl(v) !== null, {
    message: VIDEO_URL_ERROR_MESSAGE,
  });

/** 管理用ラベル（任意）。空文字は null 扱い。 */
export const VideoAdminLabelSchema = z
  .string()
  .trim()
  .max(
    VIDEO_ADMIN_LABEL_MAX_LENGTH,
    `ラベルは${VIDEO_ADMIN_LABEL_MAX_LENGTH}文字以内で入力してください`,
  )
  .transform((v) => (v === "" ? null : v));

export const VideoPlacementSchema = z.enum(
  VIDEO_PLACEMENTS as [string, ...string[]],
  { message: "掲載場所が不正です" },
);
