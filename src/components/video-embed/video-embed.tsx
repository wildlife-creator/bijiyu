import { parseVideoUrl } from "@/lib/video-embed";
import { getVideoThumbnail } from "@/lib/video-embed/fetch-thumbnail";

import { VideoEmbedInner } from "./video-embed-inner";

interface VideoEmbedProps {
  /** users.video_url または client_profiles.workplace_video_url */
  url: string;
  /** プレースホルダーの aria-label / Dialog タイトル用（任意） */
  label?: string;
}

/**
 * 動画埋込コンポーネント（async RSC）。
 *
 * サーバー側で oEmbed からサムネを取得し、クライアント側の Inner に渡す。
 * 6 呼び出し元（COM-001 / CLI-006 / CON-006 / CLI-020 / ADM-004 / ADM-009）は
 * 引き続き `<VideoEmbed url={...}>` をそのまま使える。
 *
 * - `parseVideoUrl(url)` が null（未対応 / 不正な URL）の場合は何も描画しない
 * - サムネ取得失敗時は null が渡り、Inner 側でロゴ placeholder にフォールバック
 * - 自身は active 判定を行わない。呼び出し側が
 *   `url && hasActiveOption(...)` で表示可否を制御する
 */
export async function VideoEmbed({ url, label }: VideoEmbedProps) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  const thumbnailUrl = await getVideoThumbnail(url);

  return (
    <VideoEmbedInner
      parsed={parsed}
      thumbnailUrl={thumbnailUrl}
      label={label}
    />
  );
}
