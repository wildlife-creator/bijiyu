"use server";

import { createClient } from "@/lib/supabase/server";
import { validateDocumentFile } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

export async function submitCcusAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証されていません" };
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

  // 4. Get file and ccusWorkerId from formData
  const document = formData.get("document") as File | null;
  const ccusWorkerId = formData.get("ccusWorkerId") as string | null;

  if (!document || document.size === 0) {
    return { success: false, error: "カード画像を選択してください" };
  }

  if (!ccusWorkerId || ccusWorkerId.trim() === "") {
    return { success: false, error: "技能者IDを入力してください" };
  }

  // 5. Validate file
  const docError = validateDocumentFile(document);
  if (docError) {
    return { success: false, error: docError };
  }

  // 6. Generate upload path and upload
  const timestamp = Date.now();
  const ext = getFileExtension(document.name);
  const path = `${user.id}/${ccusWorkerId}_${timestamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("ccus-documents")
    .upload(path, document);

  if (uploadError) {
    return { success: false, error: "カード画像のアップロードに失敗しました" };
  }

  // 7. Insert CCUS verification record
  const { error: insertError } = await supabase
    .from("identity_verifications")
    .insert({
      user_id: user.id,
      document_type: "ccus",
      status: "pending",
      document_url_1: path,
      ccus_worker_id: ccusWorkerId.trim(),
    });

  if (insertError) {
    return { success: false, error: "申請の登録に失敗しました" };
  }

  // 8. Insert audit log
  await supabase.from("audit_logs").insert({
    action: "ccus.submit",
    actor_id: user.id,
    target_id: user.id,
    target_type: "identity_verification",
  });

  // 9. Return success
  return { success: true };
}
