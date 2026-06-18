/**
 * 動画 URL からサムネイル URL を取得するサーバ専用ヘルパー（video-thumbnail Task 2）。
 *
 * - parseVideoUrl で platform を判定し、対応 platform のみ oEmbed を叩く
 * - 失敗時（タイムアウト・非 200・JSON 不正・thumbnail_url 欠落）は null フォールバック
 * - `unstable_cache` で 1 時間キャッシュ + tag 'video-thumbnail'
 *   （将来 admin から `revalidateTag('video-thumbnail')` 一括無効化用）
 * - 注意: TikTok / Vimeo のサムネ URL は署名付きで期限切れしうる。表示側は
 *   <img onError> でロゴ placeholder に差し戻すこと
 * - 将来 YouTube / Vimeo 追加: switch に case を 1 行、fetcher を 1 関数追加で完結
 * - **サーバー専用**: `unstable_cache` は RSC / Server Action からのみ呼べる。
 *   クライアントコンポーネントから import してはならない（unstable_cache が throw する）
 */
import { unstable_cache } from "next/cache";

import { parseVideoUrl } from "@/lib/video-embed";

const CACHE_TAG = "video-thumbnail";
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const FETCH_TIMEOUT_MS = 3000;

async function fetchOembedThumbnail(
  endpoint: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (typeof json !== "object" || json === null) return null;
    const value = (json as { thumbnail_url?: unknown }).thumbnail_url;
    if (typeof value !== "string" || !value.trim()) return null;
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchByPlatform(url: string): Promise<string | null> {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;
  switch (parsed.platform) {
    case "tiktok":
      return fetchOembedThumbnail(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      );
    default:
      return null;
  }
}

const cachedFetch = unstable_cache(fetchByPlatform, ["video-thumbnail"], {
  revalidate: CACHE_TTL_SECONDS,
  tags: [CACHE_TAG],
});

/**
 * 与えられた動画 URL のサムネイル画像 URL を返す。
 * 取得不能・未対応プラットフォーム・空入力はすべて null。
 */
export async function getVideoThumbnail(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || !url.trim()) return null;
  return cachedFetch(url);
}
