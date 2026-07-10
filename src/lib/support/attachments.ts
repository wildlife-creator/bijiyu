import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORT_ATTACHMENTS_BUCKET } from "@/lib/support/attachment-rules";

// ---------------------------------------------------------------------------
// 添付ファイル サーバー側ユーティリティ（お問い合わせ・トラブル報告 共通）
// ---------------------------------------------------------------------------
// アップロード自体はブラウザから署名付き URL で直接行う
// (@/lib/support/upload-client + prepare-upload-action)。
// ここにはレコード保存失敗時のクリーンアップのみ残す。
// ルール定義は @/lib/support/attachment-rules を参照。

/**
 * 保存済み添付ファイルを削除する（レコード保存失敗時のクリーンアップ用）。
 * best-effort。削除失敗は握りつぶす（呼び出し側の中断処理を妨げない）。
 */
export async function removeSupportAttachments(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  await admin.storage.from(SUPPORT_ATTACHMENTS_BUCKET).remove(paths);
}
