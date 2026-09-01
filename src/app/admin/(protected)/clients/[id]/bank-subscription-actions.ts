"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin/require-admin";
import { writeAuditLog } from "@/lib/audit/log";
import {
  computePeriodEnd,
  dateStringToJstIso,
  isoToJstDateString,
} from "@/lib/billing/bank-transfer";
import { comparePlans } from "@/lib/billing/compare-plans";
import { validateDowngradePrerequisites } from "@/lib/billing/validate-downgrade";
import { PAID_PLAN_TYPES, PLAN_LABELS, type PlanType } from "@/lib/constants/plans";
import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";
import {
  fetchBillingRecipient,
  formatBillingDate,
} from "@/lib/email/recipients/billing-recipient";
import { sendEmail } from "@/lib/email/send-email";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/action-result";
import { addDaysToDateString } from "@/lib/utils/format-date";

/**
 * ADM-004 発注者詳細: 銀行振込契約（subscriptions.payment_method='bank_transfer'）の
 * 運営操作（P2 / D3 手動運用）。Stripe 契約には使えない（Stripe 側は Webhook で同期）。
 *
 * - プラン変更: 即時に plan_type を差し替える（ダウングレードは Stripe 経路と同じ前提条件チェック）
 * - 期限延長: 現在の有効期限の翌日を起点に 1 か月 / 1 年延ばす（入金確認後に押す）
 * - 解約: Stripe 解約と同じ後処理（role 降格・配下メンバー削除・案件クローズ）を
 *   `handle_subscription_lifecycle_deleted`（v4: subscription_id 指定）で実行
 */

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadBankSubscription(admin: AdminClient, subscriptionId: string) {
  const { data } = await admin
    .from("subscriptions")
    .select(
      "id, user_id, plan_type, status, payment_method, billing_cycle, current_period_start, current_period_end",
    )
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!data) return { ok: false as const, error: "対象の契約が見つかりません" };
  if (data.payment_method !== "bank_transfer") {
    return {
      ok: false as const,
      error: "クレジットカード契約はこの操作の対象外です（Stripe 側で管理されます）",
    };
  }
  if (data.status !== "active") {
    return { ok: false as const, error: "この契約は既に解約されています" };
  }
  return { ok: true as const, subscription: data };
}

function revalidateClient(userId: string) {
  revalidatePath(`/admin/clients/${userId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/billing");
}

const planSchema = z.enum(PAID_PLAN_TYPES);

/** プラン変更（即時）。ダウングレード時は掲載件数・担当者数などの前提条件を満たす必要がある。 */
export async function changeBankSubscriptionPlanAction(
  subscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = planSchema.safeParse(String(formData.get("planType") ?? ""));
  if (!parsed.success) {
    return { success: false, error: "変更後のプランを選択してください" };
  }
  const targetPlan = parsed.data;

  const admin = createAdminClient();
  const loaded = await loadBankSubscription(admin, subscriptionId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const sub = loaded.subscription;
  const currentPlan = sub.plan_type as PlanType;

  if (currentPlan === targetPlan) {
    return { success: false, error: "現在と同じプランです" };
  }

  if (comparePlans(currentPlan, targetPlan) === "downgrade") {
    const validation = await validateDowngradePrerequisites(
      admin,
      sub.user_id,
      currentPlan,
      targetPlan,
    );
    if (!validation.ok) {
      return {
        success: false,
        error: `ダウングレードできません: ${validation.errors.join(" / ")}`,
      };
    }
  }

  const { error } = await admin
    .from("subscriptions")
    .update({ plan_type: targetPlan })
    .eq("id", subscriptionId)
    .eq("payment_method", "bank_transfer");
  if (error) {
    return { success: false, error: "プランの変更に失敗しました" };
  }

  if (targetPlan === "corporate" || targetPlan === "corporate_premium") {
    const { error: orgError } = await admin.rpc("ensure_organization_exists", {
      uid: sub.user_id,
    });
    if (orgError) {
      console.error("[changeBankSubscriptionPlanAction] ensure_organization_exists failed", orgError);
    }
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_plan_change",
    targetType: "subscription",
    targetId: subscriptionId,
    metadata: {
      user_id: sub.user_id,
      from: currentPlan,
      to: targetPlan,
    },
  });
  revalidateClient(sub.user_id);
  return { success: true };
}

/** 期限延長: 現在の有効期限の翌日から 1 サイクル（月払い 1 か月 / 年払い 1 年）延ばす。 */
export async function extendBankSubscriptionAction(
  subscriptionId: string,
): Promise<ActionResult<{ newPeriodEnd: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const loaded = await loadBankSubscription(admin, subscriptionId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const sub = loaded.subscription;

  if (!sub.current_period_end) {
    return { success: false, error: "有効期限が未設定のため延長できません" };
  }

  // 現在の期限日（JST 暦日）の翌日 = 次期間の開始日
  const currentEnd = isoToJstDateString(sub.current_period_end);
  const nextStart = addDaysToDateString(currentEnd, 1);
  const newEnd = computePeriodEnd(nextStart, sub.billing_cycle);
  const newEndIso = dateStringToJstIso(newEnd, "end");

  const { error } = await admin
    .from("subscriptions")
    .update({ current_period_end: newEndIso })
    .eq("id", subscriptionId)
    .eq("payment_method", "bank_transfer");
  if (error) {
    return { success: false, error: "期限の延長に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_extend",
    targetType: "subscription",
    targetId: subscriptionId,
    metadata: {
      user_id: sub.user_id,
      from: sub.current_period_end,
      to: newEndIso,
      billing_cycle: sub.billing_cycle,
    },
  });
  revalidateClient(sub.user_id);
  return { success: true, data: { newPeriodEnd: formatBillingDate(newEndIso) } };
}

/** 解約（即時）。Stripe 解約と同じ後処理を RPC で実行し、解約完了メールを送る。 */
export async function cancelBankSubscriptionAction(
  subscriptionId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const loaded = await loadBankSubscription(admin, subscriptionId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const sub = loaded.subscription;

  const { data: rpcData, error: rpcError } = await admin.rpc(
    "handle_subscription_lifecycle_deleted",
    { event_data: { subscription_id: subscriptionId, actor_id: auth.adminId } },
  );
  if (rpcError) {
    console.error("[cancelBankSubscriptionAction] RPC failed", rpcError);
    return { success: false, error: "解約処理に失敗しました" };
  }

  // 配下メンバーが退会扱いになった場合のメール印付け（Webhook 経路と同じ）
  const globallyDeletedIds =
    ((rpcData as { globally_deleted_user_ids?: string[] } | null)
      ?.globally_deleted_user_ids ?? []);
  for (const memberUserId of globallyDeletedIds) {
    try {
      await applyDeletedSuffix(admin, memberUserId, {
        path: "subscription_deleted",
        actorId: auth.adminId,
      });
    } catch (e) {
      console.error("[cancelBankSubscriptionAction] applyDeletedSuffix failed", {
        memberUserId,
        error: e,
      });
    }
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_cancel_subscription",
    targetType: "subscription",
    targetId: subscriptionId,
    metadata: { user_id: sub.user_id, plan_type: sub.plan_type },
  });

  // §6.2 解約完了メール（手動解約と同文）
  try {
    const recipient = await fetchBillingRecipient(admin, sub.user_id);
    if (recipient) {
      const tpl = subscriptionCancelledEmail({
        recipientName: recipient.name,
        planName: PLAN_LABELS[sub.plan_type as PlanType],
        cancelledAt: formatBillingDate(new Date().toISOString()),
        reason: "manual",
      });
      await sendEmail({ to: recipient.email, subject: tpl.subject, html: tpl.html });
    }
  } catch (err) {
    console.error("[cancelBankSubscriptionAction] cancelled email failed", err);
  }

  revalidateClient(sub.user_id);
  return { success: true };
}
