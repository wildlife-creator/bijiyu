"use client";

// ---------------------------------------------------------------------------
// スマホ写真 (iPhone の HEIC/HEIF) を JPEG へ変換する共通ヘルパー
// ---------------------------------------------------------------------------
// iPhone は写真をデフォルトで HEIC 形式で保存する。HEIC は Safari 以外の
// ブラウザ (Chrome / Firefox / Android) で <img> 表示できないため、案件写真や
// 本人確認書類として保存すると受け取り側の画面で表示が崩れる。
// そこで「アップロード直前にブラウザ側で HEIC → JPEG へ変換」し、Storage には
// 常に JPEG を保存する。これにより:
//   - どのブラウザ・端末でも表示できる
//   - 既存の検証 (MIME/拡張子) やバケット制限 (allowed_mime_types) は変更不要
//     (変換後は image/jpeg として扱われるため)
//   - iPhone/Safari が既に JPEG 化して渡してきた場合は素通しする
//
// WebP は主要ブラウザで表示できるため変換しない (許可リストに追加するだけ)。
// 変換ライブラリ (heic2any = libheif の WASM) は HEIC が選ばれた時だけ
// 動的 import して読み込むため、通常の JPEG/PNG アップロードには影響しない。

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * HEIC/HEIF ファイルかどうかを判定する。
 * iOS はファイル選択時に MIME を空文字や application/octet-stream で渡すことが
 * あるため、MIME だけでなく拡張子でも判定する。
 */
export function isHeic(file: File): boolean {
  if (HEIC_MIME_TYPES.has(file.type.toLowerCase())) return true;
  return HEIC_EXTENSIONS.has(extensionOf(file.name));
}

/** 変換失敗をユーザー向けメッセージ付きで表す専用エラー */
export class ImageConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageConvertError";
  }
}

export const HEIC_CONVERT_ERROR_MESSAGE =
  "画像を変換できませんでした。別の写真を選ぶか、時間をおいて再度お試しください";

/**
 * アップロード直前にファイルを変換する。
 * - HEIC/HEIF → JPEG に変換した新しい File を返す
 * - それ以外 (JPEG/PNG/WebP 等) はそのまま返す
 *
 * 変換に失敗した場合は {@link ImageConvertError} を throw するので、
 * 呼び出し側で catch してユーザーにメッセージを表示すること。
 */
export async function convertImageForUpload(file: File): Promise<File> {
  if (!isHeic(file)) return file;

  let blob: Blob;
  try {
    // HEIC が選ばれた時だけライブラリを読み込む (通常アップロードへの影響を避ける)
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    blob = Array.isArray(converted) ? converted[0] : converted;
  } catch {
    throw new ImageConvertError(HEIC_CONVERT_ERROR_MESSAGE);
  }

  const baseName = file.name.replace(/\.(heic|heif)$/i, "");
  return new File([blob], `${baseName || "image"}.jpg`, {
    type: "image/jpeg",
  });
}
