import {
  cloudflareThumbnailUrl,
  parseVideoUrl,
  parsedVideoFromCloudflareUid,
  type ParsedVideo,
} from "@/lib/video-embed";
import type { Database } from "@/types/database";

/** 表示に必要な videos 行の部分集合（SELECT 句と一致させる）。 */
export type VideoDisplayRow = Pick<
  Database["public"]["Tables"]["videos"]["Row"],
  | "id"
  | "provider"
  | "cloudflare_uid"
  | "embed_source_url"
  | "status"
  | "sort_order"
  | "admin_label"
>;

/** `VideoDisplayRow` を取得するときの SELECT 句。 */
export const VIDEO_DISPLAY_COLUMNS =
  "id, provider, cloudflare_uid, embed_source_url, status, sort_order, admin_label";

/**
 * videos 行から埋込再生用のメタ情報を組む純粋関数。
 *
 * - provider='cloudflare': UID から固定 URL（サムネ・プレイヤーとも oEmbed 不要）
 * - provider='external' : `parseVideoUrl(embed_source_url)`（TikTok 等）
 * - 不整合な行（URL 不正など）は null → 呼び出し側で描画しない
 */
export function parsedVideoFromRow(row: VideoDisplayRow): ParsedVideo | null {
  if (row.provider === "cloudflare") {
    return row.cloudflare_uid
      ? parsedVideoFromCloudflareUid(row.cloudflare_uid)
      : null;
  }
  return row.embed_source_url ? parseVideoUrl(row.embed_source_url) : null;
}

/**
 * Cloudflare 動画のサムネイル URL（ネットワーク I/O なし）。
 * external（TikTok 等）は `getVideoThumbnail()`（サーバー専用・oEmbed）で取得する。
 */
export function staticThumbnailForRow(row: VideoDisplayRow): string | null {
  if (row.provider === "cloudflare" && row.cloudflare_uid) {
    return cloudflareThumbnailUrl(row.cloudflare_uid);
  }
  return null;
}
