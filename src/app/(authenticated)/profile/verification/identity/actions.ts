"use server";

import { sendVerificationEmails } from "@/lib/email/send/verification-emails";
import { createClient } from "@/lib/supabase/server";
import { isOwnedStoragePath } from "@/lib/storage/storage-path";
import { DOCUMENT_PATH_EXTENSIONS } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

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
    return { success: false, error: "認証されていません" };
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

  // 9. Insert audit log
  await supabase.from("audit_logs").insert({
    action: "identity.submit",
    actor_id: user.id,
    target_id: user.id,
    target_type: "identity_verification",
  });

  // 10. §4.1 申請者宛控え + §4.4 運営宛通知（fire-and-forget で並列送信）
  await sendVerificationEmails({
    userId: user.id,
    documentType: "identity",
    verificationId: inserted.id,
    appliedAtIso: inserted.created_at,
  });

  // 11. Return success
  return { success: true };
}
