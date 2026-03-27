"use server";

import { createClient } from "@/lib/supabase/server";
import { validateDocumentFile } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

export async function submitIdentityAction(
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

  // 2. Get files from formData
  const document1 = formData.get("document1") as File | null;
  const document2 = formData.get("document2") as File | null;

  if (!document1 || document1.size === 0) {
    return { success: false, error: "書類を選択してください" };
  }

  if (!document2 || document2.size === 0) {
    return { success: false, error: "顔写真を選択してください" };
  }

  // 3. Validate both files
  const doc1Error = validateDocumentFile(document1);
  if (doc1Error) {
    return { success: false, error: doc1Error };
  }

  const doc2Error = validateDocumentFile(document2);
  if (doc2Error) {
    return { success: false, error: doc2Error };
  }

  // 4. Check no pending identity verification exists
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

  // 5. Generate upload paths
  const timestamp = Date.now();
  const ext1 = getFileExtension(document1.name);
  const ext2 = getFileExtension(document2.name);
  const path1 = `${user.id}/identity_${timestamp}_1.${ext1}`;
  const path2 = `${user.id}/identity_${timestamp}_2.${ext2}`;

  // 6. Upload both files
  const { error: uploadError1 } = await supabase.storage
    .from("identity-documents")
    .upload(path1, document1);

  if (uploadError1) {
    return { success: false, error: "書類のアップロードに失敗しました" };
  }

  const { error: uploadError2 } = await supabase.storage
    .from("identity-documents")
    .upload(path2, document2);

  if (uploadError2) {
    return { success: false, error: "顔写真のアップロードに失敗しました" };
  }

  // 7-8. Insert identity verification record
  const { error: insertError } = await supabase
    .from("identity_verifications")
    .insert({
      user_id: user.id,
      document_type: "identity",
      status: "pending",
      document_url_1: path1,
      document_url_2: path2,
    });

  if (insertError) {
    return { success: false, error: "申請の登録に失敗しました" };
  }

  // 9. Insert audit log
  await supabase.from("audit_logs").insert({
    action: "identity.submit",
    actor_id: user.id,
    target_id: user.id,
    target_type: "identity_verification",
  });

  // 10. Return success
  return { success: true };
}
