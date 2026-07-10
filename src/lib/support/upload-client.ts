"use client";

import { createClient } from "@/lib/supabase/client";
import {
  SUPPORT_ATTACHMENTS_BUCKET,
  SUPPORT_ATTACHMENT_RULES,
  validateSupportAttachmentMeta,
} from "@/lib/support/attachment-rules";
import { prepareSupportAttachmentUploadAction } from "@/lib/support/prepare-upload-action";

export type SupportUploadResult =
  | { success: true; paths: string[] }
  | { success: false; error: string };

/**
 * サポート添付をブラウザから署名付き URL で直接アップロードする。
 * 返り値の paths を Server Action (submitContactAction / submitTroubleReportAction)
 * に渡す。フォーム未送信で残る孤児ファイルは許容する。
 */
export async function uploadSupportFilesViaSignedUrls(
  files: File[],
  kind: "contact" | "trouble",
): Promise<SupportUploadResult> {
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
  for (const file of realFiles) {
    const error = validateSupportAttachmentMeta({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    if (error) return { success: false, error };
  }

  const prepared = await prepareSupportAttachmentUploadAction(
    kind,
    realFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
  );
  if (!prepared.success || !prepared.data) {
    return {
      success: false,
      error: prepared.success
        ? "ファイルのアップロード準備に失敗しました"
        : prepared.error,
    };
  }

  const supabase = createClient();
  const paths: string[] = [];

  for (let i = 0; i < realFiles.length; i++) {
    const file = realFiles[i];
    const target = prepared.data.targets[i];
    const { error } = await supabase.storage
      .from(SUPPORT_ATTACHMENTS_BUCKET)
      .uploadToSignedUrl(target.path, target.token, file, {
        contentType: file.type,
      });
    if (error) {
      return {
        success: false,
        error:
          "ファイルのアップロードに失敗しました。通信環境をご確認のうえ再度お試しください",
      };
    }
    paths.push(target.path);
  }

  return { success: true, paths };
}
