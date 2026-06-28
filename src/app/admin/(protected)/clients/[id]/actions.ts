"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/admin/require-admin";
import { sendEmail } from "@/lib/email/send-email";
import { accountSuspendedByAdminEmail } from "@/lib/email/templates/account-suspended-by-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeWithdrawal } from "@/lib/withdrawal/execute";
import type { ActionResult } from "@/lib/types/action-result";

const adminMemoSchema = z
  .string()
  .max(2000, "メモは2000文字以内で入力してください");

/**
 * ADM-005: 管理者メモ（client_profiles.admin_memo）の更新。
 * 保存成功で ADM-004 へ遷移 + audit log（admin_memo_update）。
 */
export async function updateAdminMemoAction(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const parsed = adminMemoSchema.safeParse(
    String(formData.get("adminMemo") ?? ""),
  );
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const memo = parsed.data.trim() === "" ? null : parsed.data;

  const admin = createAdminClient();

  // client_profiles 行の存在確認（未作成の発注者には作成して保存）
  const { data: profile } = await admin
    .from("client_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile) {
    const { error } = await admin
      .from("client_profiles")
      .update({ admin_memo: memo })
      .eq("user_id", userId);
    if (error) {
      return { success: false, error: "メモの保存に失敗しました" };
    }
  } else {
    const { error } = await admin
      .from("client_profiles")
      .insert({ user_id: userId, admin_memo: memo });
    if (error) {
      return { success: false, error: "メモの保存に失敗しました" };
    }
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "admin_memo_update",
    targetType: "client_profiles",
    targetId: userId,
  });

  revalidatePath(`/admin/clients/${userId}`);
  redirect(`/admin/clients/${userId}`);
}

/**
 * ADM-004: 発注者アカウント削除。
 * executeWithdrawal（C案カスケード: 配下メンバー連動凍結・org ソフトデリート・Stripe 解約）に
 * 委譲する。進行中取引ガードで拒否された場合はエラー文言をそのまま画面に表示する。
 */
export async function deleteClientAccountAction(
  userId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createAdminClient();

  // 対象ガード: role='client' かつ未削除のみ削除可能。
  // §8.4 メール本文に email + 姓名が必要なので削除前に取得 (applyDeletedSuffix で印付け後は取得不可)。
  const { data: target } = await admin
    .from("users")
    .select("id, role, deleted_at, email, last_name, first_name")
    .eq("id", userId)
    .maybeSingle();

  if (!target || target.role !== "client") {
    return { success: false, error: "削除対象の発注者が見つかりません" };
  }
  if (target.deleted_at) {
    return { success: false, error: "このアカウントは既に削除されています" };
  }

  // cascade 対象数（audit metadata 用）: 配下の組織メンバー数（本人除く）
  let cascadeMemberCount = 0;
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (org) {
    const { count } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .neq("user_id", userId);
    cascadeMemberCount = count ?? 0;
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
    metadata: { cascade_member_count: cascadeMemberCount },
  });

  // §8.4 admin 強制削除時の本人通知 (fire-and-forget、失敗は削除自体に影響させない)。
  // 配下メンバー (cascade) の通知は §8.5 / §8.5.5 として executeWithdrawal 側で送信済。
  if (target.email) {
    const recipientName =
      `${target.last_name ?? ""}${target.first_name ?? ""}`.trim() ||
      "ご利用者";
    const { subject, html } = accountSuspendedByAdminEmail({ recipientName });
    void sendEmail({ to: target.email, subject, html }).catch((err) => {
      console.error(
        "[deleteClientAccountAction] §8.4 account-suspended email failed",
        err,
      );
    });
  }

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}
