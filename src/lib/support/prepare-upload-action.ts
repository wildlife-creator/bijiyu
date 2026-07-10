"use server";

import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  SUPPORT_ATTACHMENTS_BUCKET,
  SUPPORT_ATTACHMENT_RULES,
  extensionOf,
  validateSupportAttachmentMeta,
  type SupportAttachmentMeta,
} from "@/lib/support/attachment-rules";
import type { ActionResult } from "@/lib/types/action-result";

export interface SignedUploadTarget {
  path: string;
  token: string;
}

/**
 * サポート添付 (お問い合わせ・トラブル報告) の署名付きアップロード URL を発行する。
 *
 * support-attachments バケットは storage RLS ポリシーを持たない (service role
 * 専用) 上、お問い合わせは未ログインでも送信できるため、own-folder ポリシーに
 * よる直接アップロードが使えない。代わりにサーバーがパスを採番して
 * createSignedUploadUrl を発行し、ブラウザは uploadToSignedUrl で直接
 * アップロードする (Vercel の 4.5MB リクエスト上限を回避)。
 * サイズ・MIME はバケットの file_size_limit / allowed_mime_types が強制する。
 */
export async function prepareSupportAttachmentUploadAction(
  kind: "contact" | "trouble",
  fileMetas: SupportAttachmentMeta[],
): Promise<ActionResult<{ targets: SignedUploadTarget[] }>> {
  if (fileMetas.length === 0) {
    return { success: true, data: { targets: [] } };
  }
  if (fileMetas.length > SUPPORT_ATTACHMENT_RULES.maxFiles) {
    return {
      success: false,
      error: `添付できるファイルは最大${SUPPORT_ATTACHMENT_RULES.maxFiles}件です`,
    };
  }
  for (const meta of fileMetas) {
    const error = validateSupportAttachmentMeta(meta);
    if (error) return { success: false, error };
  }

  // trouble はログイン必須 (middleware と二重防御)。contact は匿名可
  let prefix: string;
  if (kind === "trouble") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "ログインが必要です" };
    }
    prefix = `trouble/${user.id}`;
  } else {
    prefix = "contact";
  }

  const admin = createAdminClient();
  const targets: SignedUploadTarget[] = [];

  for (const meta of fileMetas) {
    const ext = extensionOf(meta.name);
    const path = `${prefix}/${randomUUID()}.${ext}`;
    const { data, error } = await admin.storage
      .from(SUPPORT_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("prepareSupportAttachmentUpload failed:", error?.message);
      return {
        success: false,
        error:
          "ファイルのアップロード準備に失敗しました。時間をおいて再度お試しください",
      };
    }
    targets.push({ path: data.path, token: data.token });
  }

  return { success: true, data: { targets } };
}
