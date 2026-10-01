"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { sendVerificationEmails } from "@/lib/email/send/verification-emails";
import { createClient } from "@/lib/supabase/server";
import { isOwnedStoragePath } from "@/lib/storage/storage-path";
import { DOCUMENT_PATH_EXTENSIONS } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";
import { SESSION_EXPIRED_ERROR } from "@/lib/auth/messages";

interface SubmitIdentityInput {
  /** direct-upload 済みの書類パス (identity-documents バケット) */
  document1Path: string;
  /** direct-upload 済みの顔写真パス (identity-documents バケット) */
  document2Path: string;
}

export async function submitIdentityAction(
  input: SubmitIdentityInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: SESSION_EXPIRED_ERROR };
  }

  // 2. Validate uploaded paths (direct-upload 後のパスは本人フォルダ配下のみ許可)
  const path1 = input.document1Path;
  const path2 = input.document2Path;

  if (!path1 || !isOwnedStoragePath(path1, user.id, DOCUMENT_PATH_EXTENSIONS)) {
    return { success: false, error: "本人確認書類を選択してください" };
  }
  if (!path2 || !isOwnedStoragePath(path2, user.id, DOCUMENT_PATH_EXTENSIONS)) {
    return { success: false, error: "ご本人の顔写真を選択してください" };
  }

  // 3. Check no pending identity verification exists
  const { data: existingPending } = await supabase
    .from("identity_verifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("document_type", "identity")
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return { success: false, error: "審査中の申請があります" };
  }

  // 7-8. Insert identity verification record（id / created_at は §4 通知メールで使う）
  const { data: inserted, error: insertError } = await supabase
    .from("identity_verifications")
    .insert({
      user_id: user.id,
      document_type: "identity",
      status: "pending",
      document_url_1: path1,
      document_url_2: path2,
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    return { success: false, error: "申請の登録に失敗しました" };
  }

  // 9. Insert audit log（audit_logs は会員セッションから書けないため共通ヘルパー = service_role）
  await writeAuditLog({
    actorId: user.id,
    action: "identity.submit",
    targetType: "identity_verification",
    targetId: user.id,
    metadata: { verificationId: inserted.id },
  });

  // 10. §4.1 申請者宛控え + §4.4 運営宛通知（並列送信し、完了を await する。失敗は握って申請は成功扱い）
  await sendVerificationEmails({
    userId: user.id,
    documentType: "identity",
    verificationId: inserted.id,
    appliedAtIso: inserted.created_at,
  });

  // 11. Return success
  return { success: true };
}
