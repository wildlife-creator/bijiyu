"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { canAdminCancel } from "@/lib/admin/application-status";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJstToday } from "@/lib/utils/format-date";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-014: 発注取消。
 * 受注者の自力キャンセル期限（初回稼働日5日前）以降〜前日の取消の受け皿。
 * canAdminCancel（UI のボタン表示と同一関数）を Server Action 内で再評価する。
 * 通知メールは送らない（運営が当事者連絡する運用）。
 */
export async function adminCancelApplicationAction(
  applicationId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createAdminClient();

  const { data: application } = await admin
    .from("applications")
    .select("id, status, first_work_date")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) {
    return { success: false, error: "対象の応募が見つかりません" };
  }

  if (!canAdminCancel(application, getJstToday())) {
    return {
      success: false,
      error:
        "この応募は発注取消できません（発注済みかつ初回稼働日前のみ取消可能です）",
    };
  }

  const { error: updateError } = await admin
    .from("applications")
    .update({ status: "cancelled", cancelled_by: "admin" })
    .eq("id", applicationId);

  if (updateError) {
    return { success: false, error: "発注取消の保存に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "application_cancel_admin",
    targetType: "applications",
    targetId: applicationId,
  });

  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
  return { success: true };
}
