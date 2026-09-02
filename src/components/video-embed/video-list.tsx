import { getVideoThumbnail } from "@/lib/video-embed/fetch-thumbnail";
import {
  parsedVideoFromRow,
  staticThumbnailForRow,
  type VideoDisplayRow,
} from "@/lib/videos/display";

import { VideoEmbedInner } from "./video-embed-inner";

interface VideoListProps {
  /** `getReadyVideos()` の戻り値（表示順ソート済み） */
  videos: VideoDisplayRow[];
  /** 再生ボタンの aria-label / Dialog タイトルの基底（例: 「PR動画」「職場紹介動画」） */
  label: string;
}

/**
 * 複数本の動画を表示順どおりに並べる（async RSC、P4 動画基盤）。
 *
 * 表示 6 画面（COM-001 / CLI-006 / CON-006 / CLI-020 / ADM-004 / ADM-009）から
 * `<VideoList videos={...} label="PR動画" />` で使う。各要素は既存の
 * サムネ → Dialog 再生（`VideoEmbedInner`）を流用。
 *
 * - Cloudflare 動画: サムネは固定 URL（oEmbed 不要）
 * - external（TikTok 等）: サーバー側で oEmbed からサムネ取得（1 時間キャッシュ）
 * - 解析できない行は描画しない。全て描画不能なら null
 * - 複数本のとき再生ボタンの aria-label は「{label} 2を再生」のように番号を付けて一意にする
 *   （1 本だけなら従来どおり「{label}を再生」）
 */
export async function VideoList({ videos, label }: VideoListProps) {
  const items = await Promise.all(
    videos.map(async (row) => {
      const parsed = parsedVideoFromRow(row);
      if (!parsed) return null;
      const thumbnailUrl =
        staticThumbnailForRow(row) ??
        (row.embed_source_url
          ? await getVideoThumbnail(row.embed_source_url)
          : null);
      return { id: row.id, parsed, thumbnailUrl };
    }),
  );
  const renderable = items.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  if (renderable.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-4">
      {renderable.map((item, index) => (
        <div key={item.id} className="w-full max-w-[280px]">
          <VideoEmbedInner
            parsed={item.parsed}
            thumbnailUrl={item.thumbnailUrl}
            label={renderable.length > 1 ? `${label} ${index + 1}` : label}
          />
        </div>
      ))}
    </div>
  );
}
