/**
 * 動画 URL 解析レイヤー（video-display Task 3.1）
 *
 * URL 文字列からプラットフォームを判別し、埋込再生に必要なメタ情報
 * （platform / id / aspect / embedUrl）を抽出する純粋関数。ネットワーク I/O は
 * 一切行わない。未対応・不正な URL には `null` を返す。
 *
 * `<VideoList>`（表示）と `ExternalVideoUrlSchema`（管理画面の URL 登録）の両方から
 * import される唯一の解析源。client/server 二重防御を 1 関数で担保する。
 * Cloudflare Stream にアップロードした動画は URL ではなく UID で保持するため、
 * `parsedVideoFromCloudflareUid()` で同じ ParsedVideo を組む。
 *
 * 新規プラットフォーム対応は PATTERNS への 1 エントリ追加のみで完結する。
 */

/** 対応プラットフォーム（将来 "youtube" | "vimeo" を union 追加）。 */
export type VideoPlatform = "tiktok" | "cloudflare";

/** プレイヤー領域のアスペクト比。"9/16"=縦長 / "video"=16:9 横長（Cloudflare Stream）。 */
export type VideoAspect = "9/16" | "video";

export interface ParsedVideo {
  platform: VideoPlatform;
  id: string;
  aspect: VideoAspect;
  embedUrl: string;
}

interface PlatformPattern {
  platform: VideoPlatform;
  /** new URL().hostname の完全一致判定（host 偽装を構造的に排除）。 */
  hostMatch: (hostname: string) => boolean;
  /** pathname から動画 id をキャプチャする正規表現。 */
  pathMatch: RegExp;
  aspect: VideoAspect;
  buildEmbedUrl: (id: string) => string;
}

// 要件 3.2: 新規プラットフォーム対応 = この配列に 1 エントリ追加のみ。
const PATTERNS: readonly PlatformPattern[] = [
  {
    platform: "tiktok",
    // www 有/無を許容。hostname 完全一致で評価するため
    // evil.com/www.tiktok.com/... のような host 偽装は通らない。
    hostMatch: (h) => h === "tiktok.com" || h === "www.tiktok.com",
    // 標準閲覧 URL: /@{user}/video/{digits}
    pathMatch: /^\/@[^/]+\/video\/(\d+)/,
    aspect: "9/16",
    // embedUrl は捕捉 id から常に TikTok player URL を再構築する。
    buildEmbedUrl: (id) => `https://www.tiktok.com/player/v1/${id}`,
  },
  {
    platform: "cloudflare",
    // Cloudflare Stream の埋込プレイヤー URL（P4 動画基盤）。
    // 管理画面で「URL 貼り付け」された場合も Cloudflare の UID として扱えるようにする。
    hostMatch: (h) => h === "iframe.videodelivery.net",
    pathMatch: /^\/([A-Za-z0-9]{16,64})\/?$/,
    aspect: "video",
    buildEmbedUrl: cloudflareEmbedUrl,
  },
];

/** Cloudflare Stream の埋込プレイヤー URL。 */
export function cloudflareEmbedUrl(uid: string): string {
  return `https://iframe.videodelivery.net/${uid}`;
}

/** Cloudflare Stream が自動生成するサムネイル URL（oEmbed 不要）。 */
export function cloudflareThumbnailUrl(uid: string): string {
  return `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`;
}

/** Cloudflare Stream の動画 UID から ParsedVideo を組む（URL 解析を経由しない）。 */
export function parsedVideoFromCloudflareUid(uid: string): ParsedVideo {
  return {
    platform: "cloudflare",
    id: uid,
    aspect: "video",
    embedUrl: cloudflareEmbedUrl(uid),
  };
}

/**
 * 動画 URL を解析する。
 *
 * @param url 任意の文字列（null/空も可）
 * @returns 一致すれば ParsedVideo、未対応/不正は null（冪等・副作用なし）
 */
export function parseVideoUrl(url: string): ParsedVideo | null {
  if (!url || !url.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  for (const pattern of PATTERNS) {
    if (!pattern.hostMatch(parsed.hostname)) continue;
    const match = pattern.pathMatch.exec(parsed.pathname);
    if (!match) continue;
    const id = match[1];
    return {
      platform: pattern.platform,
      id,
      aspect: pattern.aspect,
      embedUrl: pattern.buildEmbedUrl(id),
    };
  }

  return null;
}
