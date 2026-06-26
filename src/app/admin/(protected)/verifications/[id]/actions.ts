"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { verificationApprovedEmail } from "@/lib/email/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/email/templates/verification-rejected";
import { getUserDisplayName } from "@/lib/utils/display-name";
import type { ActionResult } from "@/lib/types/action-result";

const rejectionReasonSchema = z
  .string()
  .min(1, "否認理由を入力してください")
  .max(1000, "否認理由は1000文字以内で入力してください");

type PendingVerification = {
  id: string;
  user_id: string;
  document_type: "identity" | "ccus";
  ccus_worker_id: string | null;
};

/** pending レコードの取得＋楽観チェック（審査済みなら「既に審査済みです」） */
async function fetchPendingVerification(
  admin: ReturnType<typeof createAdminClient>,
  verificationId: string,
): Promise<
  { ok: true; verification: PendingVerification } | { ok: false; error: string }
> {
  const { data: verification } = await admin
    .from("identity_verifications")
    .select("id, user_id, document_type, status, ccus_worker_id")
    .eq("id", verificationId)
    .maybeSingle();

  if (!verification) {
    return { ok: false, error: "対象の申請が見つかりません" };
  }
  if (verification.status !== "pending") {
    return { ok: false, error: "既に審査済みです" };
  }
  return {
    ok: true,
    verification: {
      id: verification.id,
      user_id: verification.user_id,
      document_type: verification.document_type === "ccus" ? "ccus" : "identity",
      ccus_worker_id: verification.ccus_worker_id,
    },
  };
}

/** 通知メール（fire-and-forget。失敗しても本体処理をロールバックしない） */
async function notifyApplicant(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  buildMail: (recipient: {
    name: string;
    email: string;
  }) => { subject: string; html: string },
): Promise<void> {
  try {
    const { data: user } = await admin
      .from("users")
      .select("email, last_name, first_name, deleted_at")
      .eq("id", userId)
      .maybeSingle();
    if (!user?.email) return;

    const name = getUserDisplayName({
      lastName: user.last_name,
      firstName: user.first_name,
      deletedAt: user.deleted_at,
    });
    const { subject, html } = buildMail({ name, email: user.email });
    await sendEmail({ to: user.email, subject, html });
  } catch (err) {
    // メール失敗で業務（審査確定）を止めない。ログのみ
    console.error("[verification] notification email failed", err);
  }
}

/**
 * ADM-012: 本人確認 / CCUS 申請の承認。
 * status='approved'＋reviewed_by/reviewed_at → users フラグ更新
 * （ccus は ccus_worker_id も反映）→ audit log → 通知メール → ADM-011 へ。
 */
export async function approveVerificationAction(
  verificationId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createAdminClient();
  const fetched = await fetchPendingVerification(admin, verificationId);
  if (!fetched.ok) {
    return { success: false, error: fetched.error };
  }
  const { verification } = fetched;

  const { error: updateError } = await admin
    .from("identity_verifications")
    .update({
      status: "approved",
      reviewed_by: auth.adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", verificationId);

  if (updateError) {
    return { success: false, error: "承認の保存に失敗しました" };
  }

  const userFlags =
    verification.document_type === "ccus"
      ? {
          ccus_verified: true,
          ccus_worker_id: verification.ccus_worker_id,
        }
      : { identity_verified: true };

  const { error: userError } = await admin
    .from("users")
    .update(userFlags)
    .eq("id", verification.user_id);

  if (userError) {
    return { success: false, error: "ユーザー情報の更新に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "identity_approve",
    targetType: "identity_verifications",
    targetId: verificationId,
    metadata: { document_type: verification.document_type },
  });

  await notifyApplicant(admin, verification.user_id, ({ name }) =>
    verificationApprovedEmail({
      recipientName: name,
      documentType: verification.document_type,
    }),
  );

  revalidatePath("/admin/verifications");
  redirect("/admin/verifications");
}

/**
 * ADM-012: 本人確認 / CCUS 申請の否認。
 * 否認理由（必須・max 1000）→ status='rejected'＋rejection_reason →
 * audit log → 再提出依頼メール → ADM-011 へ。
 */
export async function rejectVerificationAction(
  verificationId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const parsed = rejectionReasonSchema.safeParse(
    String(formData.get("rejectionReason") ?? "").trim(),
  );
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "否認理由を入力してください",
    };
  }
  const rejectionReason = parsed.data;

  const admin = createAdminClient();
  const fetched = await fetchPendingVerification(admin, verificationId);
  if (!fetched.ok) {
    return { success: false, error: fetched.error };
  }
  const { verification } = fetched;

  const { error: updateError } = await admin
    .from("identity_verifications")
    .update({
      status: "rejected",
      rejection_reason: rejectionReason,
    })
    .eq("id", verificationId);

  if (updateError) {
    return { success: false, error: "否認の保存に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "identity_reject",
    targetType: "identity_verifications",
    targetId: verificationId,
    metadata: { document_type: verification.document_type },
  });

  await notifyApplicant(admin, verification.user_id, ({ name }) =>
    verificationRejectedEmail({
      recipientName: name,
      documentType: verification.document_type,
      rejectionReason,
    }),
  );

  revalidatePath("/admin/verifications");
  redirect("/admin/verifications");
}
