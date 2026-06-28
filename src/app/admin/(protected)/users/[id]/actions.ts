"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/admin/require-admin";
import { sendEmail } from "@/lib/email/send-email";
import { accountSuspendedByAdminEmail } from "@/lib/email/templates/account-suspended-by-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeWithdrawal } from "@/lib/withdrawal/execute";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-009: 受注者アカウント削除。
 * executeWithdrawal（ソフトデリート＋auth ban＋Stripe 解約）に委譲する。
 *
 * 削除できるのは role='contractor' のみ。client は配下スタッフ連動削除を含む
 * ADM-004 の deleteClientAccountAction に一本化する（UI と二重防御）。
 * 進行中取引ガードで拒否された場合はエラー文言をそのまま画面に表示する。
 */
export async function deleteUserAccountAction(
  userId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createAdminClient();

  // §8.4 メール本文に email + 姓名が必要なので削除前に取得 (applyDeletedSuffix で印付け後は取得不可)。
  const { data: target } = await admin
    .from("users")
    .select("id, role, deleted_at, email, last_name, first_name")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    return { success: false, error: "削除対象のユーザーが見つかりません" };
  }
  if (target.role === "client") {
    return {
      success: false,
      error: "発注者アカウントの削除は発注者アカウント詳細から行ってください",
    };
  }
  if (target.role !== "contractor") {
    return { success: false, error: "このアカウントは削除できません" };
  }
  if (target.deleted_at) {
    return { success: false, error: "このアカウントは既に削除されています" };
  }

  const result = await executeWithdrawal({
    targetUserId: userId,
    recordSurvey: null,
    cancelledBy: "admin",
  });

  if (!result.success) {
    // 進行中取引ガード等のエラー文言は admin 画面にそのまま表示する
    return result;
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "account_delete",
    targetType: "users",
    targetId: userId,
  });

  // §8.4 admin 強制削除時の本人通知 (fire-and-forget、失敗は削除自体に影響させない)。
  if (target.email) {
    const recipientName =
      `${target.last_name ?? ""}${target.first_name ?? ""}`.trim() ||
      "ご利用者";
    const { subject, html } = accountSuspendedByAdminEmail({ recipientName });
    void sendEmail({ to: target.email, subject, html }).catch((err) => {
      console.error(
        "[deleteUserAccountAction] §8.4 account-suspended email failed",
        err,
      );
    });
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
