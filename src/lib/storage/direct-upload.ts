"use client";

import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// ブラウザ → Supabase Storage 直接アップロード共通ヘルパー
// ---------------------------------------------------------------------------
// Server Action (FormData) 経由のファイル送信は Vercel のリクエストボディ上限
// (約4.5MB) で 413 になるため、ファイル本体はブラウザから Storage へ直接
// アップロードし、Server Action にはストレージパスのみを渡す。
// - 認可は各バケットの own-folder INSERT ポリシー (folder[1] = auth.uid())
// - サイズ・MIME はバケット側の file_size_limit / allowed_mime_types でも強制
//   (20260710120000_bucket_upload_limits.sql)
// - フォーム未送信で残る孤児ファイルは許容する (実害なし・パスは DB 未参照)

export interface UploadRule {
  /** 1ファイルあたりの最大バイト数 */
  maxBytes: number;
  /** エラーメッセージ用の表記 (例: "10MB") */
  maxBytesLabel: string;
  allowedMimeTypes: readonly string[];
  /** ドット無し小文字 (例: ["jpg", "jpeg", "png"]) */
  allowedExtensions: readonly string[];
  /** 種別エラー時のメッセージ */
  typeErrorMessage: string;
}

export const IMAGE_UPLOAD_RULE_10MB: UploadRule = {
  maxBytes: 10 * 1024 * 1024,
  maxBytesLabel: "10MB",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  allowedExtensions: ["jpg", "jpeg", "png", "webp"],
  typeErrorMessage: "JPEG・PNG・WebP形式の画像を選択してください",
};

export const IMAGE_UPLOAD_RULE_5MB: UploadRule = {
  ...IMAGE_UPLOAD_RULE_10MB,
  maxBytes: 5 * 1024 * 1024,
  maxBytesLabel: "5MB",
};

export const DOCUMENT_UPLOAD_RULE_10MB: UploadRule = {
  maxBytes: 10 * 1024 * 1024,
  maxBytesLabel: "10MB",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  allowedExtensions: ["jpg", "jpeg", "png", "webp", "pdf"],
  typeErrorMessage: "JPEG・PNG・WebP形式の画像、またはPDFを選択してください",
};

export type DirectUploadResult =
  | { success: true; paths: string[] }
  | { success: false; error: string };

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/** MIME からフォールバック拡張子を導く (拡張子なしファイル名対策) */
function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "";
  }
}

/** ファイル1件をルール検証する。問題なければ null を返す */
export function validateFileAgainstRule(
  file: File,
  rule: UploadRule,
): string | null {
  if (!rule.allowedMimeTypes.includes(file.type)) {
    return rule.typeErrorMessage;
  }
  const ext = extensionOf(file.name) || extensionFromMime(file.type);
  if (!rule.allowedExtensions.includes(ext)) {
    return rule.typeErrorMessage;
  }
  if (file.size > rule.maxBytes) {
    return `ファイルサイズは1件あたり${rule.maxBytesLabel}以下にしてください`;
  }
  return null;
}

/**
 * ファイル群を検証し、`${uid}/[subdir/]${uuid}.${ext}` へ直接アップロードする。
 * 返り値の paths は files と同順。途中失敗時はアップロード済みファイルを
 * best-effort で削除してからエラーを返す。
 */
export async function uploadFilesDirect(opts: {
  bucket: string;
  files: File[];
  rule: UploadRule;
  /** uid 直下に挟むサブフォルダ (例: applicationId)。省略可 */
  subdir?: string;
}): Promise<DirectUploadResult> {
  const { bucket, files, rule, subdir } = opts;
  const realFiles = files.filter((f) => f && f.size > 0);
  if (realFiles.length === 0) {
    return { success: true, paths: [] };
  }

  // 保存前に全件まとめて検証
  for (const file of realFiles) {
    const error = validateFileAgainstRule(file, rule);
    if (error) return { success: false, error };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      error: "認証情報が見つかりません。再度ログインしてください。",
    };
  }

  const prefix = subdir ? `${user.id}/${subdir}` : user.id;
  const uploadedPaths: string[] = [];

  for (const file of realFiles) {
    const ext = extensionOf(file.name) || extensionFromMime(file.type);
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type });

    if (error) {
      // 途中失敗: それまでの分を削除して孤児を残さない (best-effort)
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(bucket).remove(uploadedPaths);
      }
      return {
        success: false,
        error:
          "ファイルのアップロードに失敗しました。通信環境をご確認のうえ再度お試しください",
      };
    }
    uploadedPaths.push(path);
  }

  return { success: true, paths: uploadedPaths };
}
