"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { sendVerificationEmails } from "@/lib/email/send/verification-emails";
import { createClient } from "@/lib/supabase/server";
import { isOwnedStoragePath } from "@/lib/storage/storage-path";
import { DOCUMENT_PATH_EXTENSIONS } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";
import { SESSION_EXPIRED_ERROR } from "@/lib/auth/messages";

interface SubmitCcusInput {
  /** direct-upload 済みのカード画像パス (ccus-documents バケット) */
  documentPath: string;
  ccusWorkerId: string;
}

export async function submitCcusAction(
  input: SubmitCcusInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: SESSION_EXPIRED_ERROR };
  }

  // 2. Check identity verification is approved
  const { data: identityVerification } = await supabase
    .from("identity_verifications")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("document_type", "identity")
    .eq("status", "approved")
    .maybeSingle();

  if (!identityVerification) {
    return { success: false, error: "本人確認が承認されていません" };
  }

  // 3. Check no pending CCUS verification exists
  const { data: existingPending } = await supabase
    .from("identity_verifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("document_type", "ccus")
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return { success: false, error: "審査中の申請があります" };
  }

  // 4. Validate inputs (パスは direct-upload 済み。本人フォルダ配下のみ許可)
  const path = input.documentPath;
  const ccusWorkerId = input.ccusWorkerId;

  if (!path || !isOwnedStoragePath(path, user.id, DOCUMENT_PATH_EXTENSIONS)) {
    return { success: false, error: "カード画像を選択してください" };
  }

  if (!ccusWorkerId || ccusWorkerId.trim() === "") {
    return { success: false, error: "技能者IDを入力してください" };
  }

  // 7. Insert CCUS verification record（id / created_at は §4 通知メールで使う）
  const { data: inserted, error: insertError } = await supabase
    .from("identity_verifications")
    .insert({
      user_id: user.id,
      document_type: "ccus",
      status: "pending",
      document_url_1: path,
      ccus_worker_id: ccusWorkerId.trim(),
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    return { success: false, error: "申請の登録に失敗しました" };
  }

  // 8. Insert audit log（audit_logs は会員セッションから書けないため共通ヘルパー = service_role）
  await writeAuditLog({
    actorId: user.id,
    action: "ccus.submit",
    targetType: "identity_verification",
    targetId: user.id,
    metadata: { verificationId: inserted.id },
  });

  // 9. §4.1 申請者宛控え + §4.4 運営宛通知（並列送信し、完了を await する。失敗は握って申請は成功扱い）
  await sendVerificationEmails({
    userId: user.id,
    documentType: "ccus",
    verificationId: inserted.id,
    appliedAtIso: inserted.created_at,
  });

  // 10. Return success
  return { success: true };
}
