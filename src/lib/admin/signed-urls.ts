import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";

/** 署名付きURLの有効期限（1時間） */
const SIGNED_URL_EXPIRES_IN = 3600;

/** admin 画面が扱う非公開バケット */
type PrivateBucket =
  | "identity-documents"
  | "ccus-documents"
  | "support-attachments"
  | "message-attachments";

/**
 * 非公開バケットのパス群から署名付きURL（有効期限1時間）を一括生成する。
 *
 * audit オプション指定時は audit_logs に identity_access を記録する。
 * URL 生成と監査記録を一体化することで、本人確認書類等への
 * アクセス記録漏れを構造的に防止する（ADM-012 等で使用）。
 *
 * 生成失敗は throw せず該当パスを url: null で返す（呼び出し側でフォールバック表示）。
 */
export async function getSignedDocumentUrls(params: {
  bucket: PrivateBucket;
  paths: string[];
  audit?: {
    actorId: string;
    targetType: string;
    targetId: string;
    documentType?: "identity" | "ccus";
  };
}): Promise<{ path: string; url: string | null }[]> {
  const { bucket, paths, audit } = params;

  if (paths.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN);

  if (audit) {
    await writeAuditLog({
      actorId: audit.actorId,
      action: "identity_access",
      targetType: audit.targetType,
      targetId: audit.targetId,
      metadata: {
        bucket,
        document_type: audit.documentType ?? null,
        path_count: paths.length,
      },
    });
  }

  if (error || !data) {
    console.error("[getSignedDocumentUrls] createSignedUrls failed", {
      bucket,
      error,
    });
    return paths.map((path) => ({ path, url: null }));
  }

  return paths.map((path) => {
    const entry = data.find((d) => d.path === path);
    return { path, url: entry?.signedUrl ?? null };
  });
}
