"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import {
  canAdminCancel,
  canAdminResolveExpired,
} from "@/lib/admin/application-status";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJstToday } from "@/lib/utils/format-date";
import type { ActionResult } from "@/lib/types/action-result";

/** ADM-014 の状態変更に必要な最小の応募情報（案件の稼働終了日込み） */
async function fetchApplicationForAdmin(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: string,
) {
  const { data } = await admin
    .from("applications")
    .select("id, status, first_work_date, job:jobs(work_end_date)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data) return null;
  const job = Array.isArray(data.job) ? (data.job[0] ?? null) : data.job;
  return {
    id: data.id,
    status: data.status,
    first_work_date: data.first_work_date,
    job: (job ?? null) as { work_end_date: string | null } | null,
  };
}

/**
 * ADM-014: 発注取消。
 * - 初回稼働日前: 受注者の自力キャンセル期限（初回稼働日5日前）以降〜前日の取消の受け皿
 * - 期限切れ（稼働終了日+5日を過ぎた accepted）: 稼働しなかった案件を取消にしてデッドロックを
 *   解消する（ステージング指摘 No.8）。実際に稼働した案件は adminCompleteApplicationAction
 * canAdminCancel / canAdminResolveExpired（UI のボタン表示と同一関数）を Server Action 内で再評価する。
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
  const application = await fetchApplicationForAdmin(admin, applicationId);

  if (!application) {
    return { success: false, error: "対象の応募が見つかりません" };
  }

  const today = getJstToday();
  const expired = canAdminResolveExpired(application, application.job, today);
  if (!canAdminCancel(application, today) && !expired) {
    return {
      success: false,
      error:
        "この応募は発注取消できません（発注済みかつ初回稼働日前、または評価・完了報告の入力期間を過ぎたもののみ取消可能です）",
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
    metadata: expired ? { reason: "review_window_expired" } : undefined,
  });

  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
  return { success: true };
}

/**
 * ADM-014: 期限切れの発注済み応募を「完了扱い（completed）」にする。
 *
 * 評価・完了報告の入力期間（初回稼働日〜稼働終了日+5日）を過ぎた accepted は、当事者も運営も
 * 画面から解消できず、退会ガード（進行中案件あり）に永久に引っかかる（ステージング指摘 No.8）。
 * 実際に稼働が終わった案件はこの操作で completed にする（評価は付かない）。
 * 稼働しなかった案件は adminCancelApplicationAction（取消）を使う。
 * canAdminResolveExpired（UI のボタン表示と同一関数）を Server Action 内で再評価する。
 * 通知メールは送らない（運営が当事者連絡する運用）。
 */
export async function adminCompleteApplicationAction(
  applicationId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createAdminClient();
  const application = await fetchApplicationForAdmin(admin, applicationId);

  if (!application) {
    return { success: false, error: "対象の応募が見つかりません" };
  }

  if (!canAdminResolveExpired(application, application.job, getJstToday())) {
    return {
      success: false,
      error:
        "この応募は完了扱いにできません（発注済みかつ評価・完了報告の入力期間を過ぎたもののみ操作可能です）",
    };
  }

  const { error: updateError } = await admin
    .from("applications")
    .update({ status: "completed" })
    .eq("id", applicationId);

  if (updateError) {
    return { success: false, error: "完了扱いの保存に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "application_complete_admin",
    targetType: "applications",
    targetId: applicationId,
    metadata: { reason: "review_window_expired" },
  });

  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/admin/applications");
  return { success: true };
}
