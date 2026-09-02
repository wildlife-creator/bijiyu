import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * 監査ログのアクション種別（単一情報源）。
 * 新しい管理者操作を追加する場合はここに追記すること。
 */
export type AuditAction =
  // 既存ログイン（実値をそのまま維持・変更しない）
  | "auth.login.success"
  | "auth.login.failure"
  // 本人確認（値は requirements 指定に従う）
  | "identity_access"
  | "identity_approve"
  | "identity_reject"
  // アカウント管理
  | "account_delete"
  | "admin_client_invite"
  // 応募管理
  | "application_cancel_admin"
  // 管理者自身の操作
  | "admin_password_change"
  | "admin_memo_update"
  // 動画 URL 更新（旧 ADM-010 / ADM-010B。P4 で廃止。過去ログの値として残す）
  | "video_url_update"
  // 動画管理（ADM-027、P4）: 追加 / ラベル・状態更新 / 表示順入替 / 削除
  | "video_create"
  | "video_update"
  | "video_reorder"
  | "video_delete"
  // 銀行振込（P2）: 申込レコードの状態遷移と、振込契約の運営操作
  | "bank_transfer_invoiced"
  | "bank_transfer_activate"
  | "bank_transfer_cancel"
  | "bank_transfer_memo_update"
  | "bank_transfer_plan_change"
  | "bank_transfer_extend"
  | "bank_transfer_cancel_subscription";

/**
 * 監査ログ用のメールマスク: 先頭1文字 + *** + @domain
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

/**
 * 監査ログを audit_logs に記録する。
 *
 * 【必須】INSERT は createAdminClient()（service_role）で行う。
 * audit_logs は INSERT ポリシーが無い server-side only 設計のため、
 * セッションクライアントからの INSERT は RLS で全件サイレント失敗する
 * （旧 login/actions.ts 内ローカル実装の既存バグ。本共有化で修正済み）。
 *
 * 失敗しても throw しない（監査の失敗で業務処理を止めない）。
 * 失敗はサーバーログに記録する。
 */
export async function writeAuditLog(params: {
  actorId: string | null;
  action: AuditAction;
  targetType: string;
  /** uuid 形式であること（audit_logs.target_id は uuid 型） */
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_id: params.actorId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      metadata: (params.metadata ?? null) as Json,
    });
    if (error) {
      console.error("[writeAuditLog] insert failed (non-blocking)", {
        action: params.action,
        error,
      });
    }
  } catch (err) {
    console.error("[writeAuditLog] unexpected failure (non-blocking)", {
      action: params.action,
      err,
    });
  }
}
