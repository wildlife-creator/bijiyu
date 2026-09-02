"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/require-admin";
import { writeAuditLog } from "@/lib/audit/log";
import { grantBankTransferPlan } from "@/lib/billing/grant-plan";
import {
  OPS_ACCOUNT_PERIOD_END_DATE,
  OPS_ACCOUNT_PLAN_TYPE,
} from "@/lib/admin/ops-account";
import { todayJstDateString } from "@/lib/billing/bank-transfer";
import { PLAN_LABELS } from "@/lib/constants/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-009: 管理運営アカウントの設定 / 解除（P5 / spec-changes-202608 §2.4, D10）。
 *
 * 管理運営アカウント = 運営が「職人を発注者へ提案 / 案件を職人へ提案」するために使う、
 * 最上位プラン（ハイエンド）相当の一般会員。
 * - 設定: users.is_hidden = true（一覧・検索・マイリスト・スカウト対象から除外）
 *         + 手動サブスク行（銀行振込・ハイエンド・期限 2099-12-31）を付与
 *         + contractor → client 昇格 / client_profiles / 組織作成（grantBankTransferPlan）
 *         有効化メールは送らない（内部アカウント）
 * - 解除: users.is_hidden = false に戻すのみ。契約行の解約は ADM-004 の銀行振込パネル
 */

const GENERIC_ERROR = "処理に失敗しました。しばらくしてから再度お試しください";

function revalidateUserPages(userId: string) {
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/clients/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/clients");
}

/** 管理運営アカウントに設定する（非表示 + 手動サブスク付与）。 */
export async function setOpsAccountAction(userId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("id, role, deleted_at, is_hidden, last_name, first_name")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { success: false, error: "対象ユーザーが見つかりません" };
  if (target.deleted_at) {
    return { success: false, error: "退会済みのユーザーは設定できません" };
  }
  if (target.role === "admin" || target.role === "staff") {
    return {
      success: false,
      error:
        "管理者アカウント・担当者アカウントは設定できません。受注者または発注者（契約主体）のアカウントを指定してください",
    };
  }

  // 既存契約の確認: ハイエンドの銀行振込行なら付与済みとみなして非表示だけ更新（冪等）。
  // それ以外（Stripe 契約・他プランの銀行振込）は解約後に設定してもらう
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, plan_type, payment_method")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .limit(1)
    .maybeSingle();

  let subscriptionId: string | null = existing?.id ?? null;
  let granted = false;
  if (existing) {
    const isOpsStyle =
      existing.payment_method === "bank_transfer" &&
      existing.plan_type === OPS_ACCOUNT_PLAN_TYPE;
    if (!isOpsStyle) {
      const label =
        PLAN_LABELS[existing.plan_type as keyof typeof PLAN_LABELS] ??
        existing.plan_type;
      return {
        success: false,
        error: `この方は別のプランを契約中です（${label}）。解約後に設定してください`,
      };
    }
  } else {
    const fullName =
      `${target.last_name ?? ""}${target.first_name ?? ""}`.trim() || "運営";
    const result = await grantBankTransferPlan(admin, {
      userId,
      userRole: target.role,
      fullName,
      planType: OPS_ACCOUNT_PLAN_TYPE,
      billingCycle: "yearly",
      startDate: todayJstDateString(),
      periodEndDate: OPS_ACCOUNT_PERIOD_END_DATE,
      via: "ops_account",
      sendActivationEmail: false,
    });
    if (!result.ok) return { success: false, error: result.error };
    subscriptionId = result.subscriptionId;
    granted = true;
  }

  const { error } = await admin
    .from("users")
    .update({ is_hidden: true })
    .eq("id", userId);
  if (error) {
    console.error("[setOpsAccountAction] is_hidden update failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "ops_account_set",
    targetType: "users",
    targetId: userId,
    metadata: {
      subscriptionId,
      granted,
      planType: OPS_ACCOUNT_PLAN_TYPE,
      periodEndDate: OPS_ACCOUNT_PERIOD_END_DATE,
      previousRole: target.role,
    },
  });

  revalidateUserPages(userId);
  return { success: true };
}

/** 管理運営アカウントを解除する（非表示フラグを戻すのみ）。 */
export async function unsetOpsAccountAction(
  userId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("id, is_hidden")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { success: false, error: "対象ユーザーが見つかりません" };
  if (!target.is_hidden) return { success: true };

  const { error } = await admin
    .from("users")
    .update({ is_hidden: false })
    .eq("id", userId);
  if (error) {
    console.error("[unsetOpsAccountAction] is_hidden update failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "ops_account_unset",
    targetType: "users",
    targetId: userId,
  });

  revalidateUserPages(userId);
  return { success: true };
}
