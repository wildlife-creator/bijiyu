import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// 添付ファイル共通ユーティリティ（お問い合わせ・トラブル報告 共通）
// ---------------------------------------------------------------------------
// 枚数・種別・サイズを MIME と拡張子の両面で検証し、ファイル名をランダム化して
// 非公開バケットへ service role（admin クライアント）で保存する。
// 失敗時は、それまでにアップロードしたファイルを削除して孤児を残さない。

export const SUPPORT_ATTACHMENTS_BUCKET = "support-attachments";

export const SUPPORT_ATTACHMENT_RULES = {
  maxFiles: 5,
  maxBytesPerFile: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
  allowedExtensions: ["jpg", "jpeg", "png", "pdf"],
} as const;

export type UploadResult =
  | { success: true; paths: string[] }
  | { success: false; error: string };

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * 添付ファイルを検証して非公開バケットへ保存する。
 * - 空ファイル（size=0）は除外する
 * - 枚数（最大5）・MIME・拡張子・サイズ（各5MB）を検証する
 * - ファイル名は `${randomUUID()}.${ext}` に変換（元名は保存しない）
 * - 途中失敗時は、それまでに保存したファイルを削除する
 *
 * @param files FormData 由来の File[]
 * @param pathPrefix 信頼できるサーバー生成のパス接頭辞（例: "contact" / "trouble/{userId}"）
 */
export async function uploadSupportAttachments(
  files: File[],
  pathPrefix: string,
): Promise<UploadResult> {
  const realFiles = files.filter((f) => f && f.size > 0);

  if (realFiles.length === 0) {
    return { success: true, paths: [] };
  }

  if (realFiles.length > SUPPORT_ATTACHMENT_RULES.maxFiles) {
    return {
      success: false,
      error: `添付できるファイルは最大${SUPPORT_ATTACHMENT_RULES.maxFiles}件です`,
    };
  }

  // 検証（全件） — 保存前にまとめて弾く
  for (const file of realFiles) {
    if (file.size > SUPPORT_ATTACHMENT_RULES.maxBytesPerFile) {
      return {
        success: false,
        error: "1ファイルあたり5MBまでのファイルを添付できます",
      };
    }
    if (
      !(SUPPORT_ATTACHMENT_RULES.allowedMimeTypes as readonly string[]).includes(
        file.type,
      )
    ) {
      return {
        success: false,
        error: "添付できるのは画像（JPEG／PNG）とPDFのみです",
      };
    }
    const ext = extensionOf(file.name);
    if (
      !(SUPPORT_ATTACHMENT_RULES.allowedExtensions as readonly string[]).includes(
        ext,
      )
    ) {
      return {
        success: false,
        error: "添付できるのは画像（JPEG／PNG）とPDFのみです",
      };
    }
  }

  const admin = createAdminClient();
  const uploadedPaths: string[] = [];

  for (const file of realFiles) {
    const ext = extensionOf(file.name);
    const path = `${pathPrefix}/${randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from(SUPPORT_ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type });

    if (error) {
      // 途中失敗: それまでに保存したファイルを削除して孤児を残さない
      await removeSupportAttachments(uploadedPaths);
      return {
        success: false,
        error: "ファイルのアップロードに失敗しました",
      };
    }
    uploadedPaths.push(path);
  }

  return { success: true, paths: uploadedPaths };
}

/**
 * 保存済み添付ファイルを削除する（レコード保存失敗時のクリーンアップ用）。
 * best-effort。削除失敗は握りつぶす（呼び出し側の中断処理を妨げない）。
 */
export async function removeSupportAttachments(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  await admin.storage.from(SUPPORT_ATTACHMENTS_BUCKET).remove(paths);
}
