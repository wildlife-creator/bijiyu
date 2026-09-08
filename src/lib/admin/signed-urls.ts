import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";

/** 署名付きURLの有効期限（1時間） */
const SIGNED_URL_EXPIRES_IN = 3600;

/** 署名 URL 生成の再試行回数（初回 + 1 回）と待ち時間 */
const SIGNED_URL_RETRY_COUNT = 1;
const SIGNED_URL_RETRY_DELAY_MS = 300;

/**
 * createSignedUrls を 1 回だけ自動再試行する。
 * Storage API の一時的な失敗で「書類を表示できません」になり、開き直すと直る
 * （ステージング確認-3(a)）症状を減らすため。再試行しても失敗したら error を返す。
 */
async function createSignedUrlsWithRetry(
  admin: ReturnType<typeof createAdminClient>,
  bucket: PrivateBucket,
  paths: string[],
) {
  let last = await admin.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN);
  for (let i = 0; i < SIGNED_URL_RETRY_COUNT && (last.error || !last.data); i++) {
    await new Promise((r) => setTimeout(r, SIGNED_URL_RETRY_DELAY_MS));
    last = await admin.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN);
  }
  return last;
}

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
 * 生成失敗は 1 回自動再試行し、それでも失敗したら throw せず該当パスを url: null で
 * 返す（呼び出し側でフォールバック表示）。
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
  const { data, error } = await createSignedUrlsWithRetry(admin, bucket, paths);

  // 監査ログは再試行の有無に関係なく 1 回だけ記録する
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
