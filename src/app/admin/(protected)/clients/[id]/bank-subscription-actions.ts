"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin/require-admin";
import { writeAuditLog } from "@/lib/audit/log";
import { sendVideoActivatedEmails } from "@/lib/billing/activation-emails";
import { todayJstDateString } from "@/lib/billing/bank-transfer";
import { comparePlans } from "@/lib/billing/compare-plans";
import { grantBankTransferPlan } from "@/lib/billing/grant-plan";
import { getStripeClient } from "@/lib/billing/stripe";
import { validateDowngradePrerequisites } from "@/lib/billing/validate-downgrade";
import {
  BANK_TRANSFER_VIDEO_PLAN_KEYS,
} from "@/lib/constants/contact-options";
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

/**
 * ADM-009 ユーザー詳細 の「銀行振込」枠（`<BankTransferPanel>`）の
 * Server Action（仕様: docs/requirements/current-spec.md「銀行振込」）。
 *
 * 銀行振込はアプリ上「プランのオン／オフ」だけ。請求書・入金確認・更新時期はアプリ外。
 * - 有効化: 有効プランなし → 銀行振込行を作る（期限なし。role 昇格・client_profiles・組織・有効化メール）
 * - 変更: 即時に plan_type を差し替える（ダウングレードは Stripe 経路と同じ前提条件チェック）
 * - 無効化: Stripe 解約と同じ後処理（role 降格・配下メンバー削除・案件クローズ）を
 *   `handle_subscription_lifecycle_deleted`（v4: subscription_id 指定）で実行
 * - カード → 銀行振込: Stripe を即時解約し、同じ契約行の支払方法を書き換える（§3.1。有料が途切れない）
 * - 動画プラン: option_subscriptions に買い切りの銀行振込行を作り、購入完了メールを送る
 *
 * 銀行振込 → カードは会員が料金プラン画面で Checkout する（§3.2。運営操作なし）。
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const GENERIC_ERROR = "処理に失敗しました。しばらくしてから再度お試しください";

const planSchema = z.enum(PAID_PLAN_TYPES);
const videoPlanSchema = z.enum(BANK_TRANSFER_VIDEO_PLAN_KEYS);

/** 対象会員の検査: 退会済み・担当者（staff）・管理者には契約を付けない（契約主体になれない） */
async function loadTargetUser(admin: AdminClient, userId: string) {
  const { data } = await admin
    .from("users")
    .select("id, role, deleted_at, last_name, first_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return { ok: false as const, error: "対象の会員が見つかりません" };
  if (data.deleted_at) {
    return { ok: false as const, error: "退会済みの会員には設定できません" };
  }
  if (data.role === "staff") {
    return {
      ok: false as const,
      error: "担当者アカウントには設定できません（契約主体である管理責任者のアカウントを指定してください）",
    };
  }
  if (data.role === "admin") {
    return { ok: false as const, error: "管理者アカウントには設定できません" };
  }
  return { ok: true as const, user: data };
}

async function loadBankSubscription(admin: AdminClient, subscriptionId: string) {
  const { data } = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, status, payment_method")
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
    return { ok: false as const, error: "この契約は既に無効です" };
  }
  return { ok: true as const, subscription: data };
}

function revalidateUserPages(userId: string) {
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/clients/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/bank-transfers");
  revalidatePath("/billing");
}

// ---------------------------------------------------------------------------
// 有効化（有効プランなし → 銀行振込行を作成）
// ---------------------------------------------------------------------------

export async function activateBankTransferPlanAction(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = planSchema.safeParse(String(formData.get("planType") ?? ""));
  if (!parsed.success) {
    return { success: false, error: "プランを選択してください" };
  }
  const planType = parsed.data;

  const admin = createAdminClient();
  const target = await loadTargetUser(admin, userId);
  if (!target.ok) return { success: false, error: target.error };

  // 既に有効なプランがあれば拒否（subscriptions_unique_active が最終防御）
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, payment_method")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      success: false,
      error:
        existing.payment_method === "stripe"
          ? "この方はクレジットカードでご契約中です。「銀行振込に切り替える」を使ってください"
          : "この方には有効な銀行振込プランが既にあります。「変更する」を使ってください",
    };
  }

  const fullName =
    `${target.user.last_name ?? ""}${target.user.first_name ?? ""}`.trim() || "未設定";
  const granted = await grantBankTransferPlan(admin, {
    userId,
    userRole: target.user.role,
    fullName,
    planType,
    billingCycle: "monthly",
    startDate: todayJstDateString(),
    via: "bank_transfer",
  });
  if (!granted.ok) return { success: false, error: granted.error };

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_activate",
    targetType: "subscription",
    targetId: granted.subscriptionId,
    metadata: { user_id: userId, plan_type: planType, previous_role: target.user.role },
  });
  revalidateUserPages(userId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// 変更（銀行振込で契約中 → 別のプランへ即時）
// ---------------------------------------------------------------------------

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
    metadata: { user_id: sub.user_id, from: currentPlan, to: targetPlan },
  });
  revalidateUserPages(sub.user_id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// 無効化（即時。Stripe 解約と同じ後処理 + 解約完了メール）
// ---------------------------------------------------------------------------

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
    return { success: false, error: "無効化に失敗しました" };
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

  revalidateUserPages(sub.user_id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// カード払い → 銀行振込（§3.1）
// ---------------------------------------------------------------------------

/**
 * Stripe の契約を即時解約（日割り返金なし）し、同じ契約行の支払方法を銀行振込に書き換える。
 * 契約行が途切れないので、案件クローズ・role 降格などの後処理は走らない。
 * その後 Stripe から届く customer.subscription.updated / deleted は、行が見つからないため
 * Webhook 側が黙って skip する（handle-subscription-lifecycle.ts の既存挙動）。
 */
export async function switchStripeToBankTransferAction(
  subscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = planSchema.safeParse(String(formData.get("planType") ?? ""));
  if (!parsed.success) {
    return { success: false, error: "プランを選択してください" };
  }
  const targetPlan = parsed.data;

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, status, payment_method, stripe_subscription_id, schedule_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return { success: false, error: "対象の契約が見つかりません" };
  if (sub.payment_method !== "stripe" || !sub.stripe_subscription_id) {
    return { success: false, error: "クレジットカード契約ではないため切り替えできません" };
  }
  if (sub.status !== "active" && sub.status !== "past_due") {
    return { success: false, error: "この契約は既に終了しています" };
  }

  const target = await loadTargetUser(admin, sub.user_id);
  if (!target.ok) return { success: false, error: target.error };

  const currentPlan = sub.plan_type as PlanType;
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

  // 1. Stripe: 予約（Subscription Schedule）があれば解放してから即時解約
  const stripe = getStripeClient();
  try {
    const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const scheduleId =
      typeof live.schedule === "string" ? live.schedule : (live.schedule?.id ?? null);
    if (scheduleId) {
      await stripe.subscriptionSchedules.release(scheduleId);
    }
    await stripe.subscriptions.cancel(sub.stripe_subscription_id);
  } catch (err) {
    console.error("[switchStripeToBankTransferAction] Stripe API failed", err);
    return {
      success: false,
      error: "カード払いの停止に失敗しました。しばらくしてから再度お試しください",
    };
  }

  // 2. DB: 同じ行を銀行振込に書き換える（期限なし・予約系はクリア）
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      payment_method: "bank_transfer",
      stripe_subscription_id: null,
      plan_type: targetPlan,
      billing_cycle: "monthly",
      status: "active",
      cancel_at_period_end: false,
      schedule_id: null,
      scheduled_plan_type: null,
      scheduled_billing_cycle: null,
      scheduled_at: null,
      past_due_since: null,
      current_period_start: new Date().toISOString(),
      current_period_end: null,
    })
    .eq("id", subscriptionId);
  if (updateError) {
    // Stripe は既に停止済み。このまま Webhook が届くと通常の解約後処理が走るため、
    // 運営が「有効にする」を押し直せるよう明示的に案内する
    console.error("[switchStripeToBankTransferAction] subscriptions update failed", updateError);
    return {
      success: false,
      error:
        "カード払いは停止しましたが、切り替えの記録に失敗しました。画面を更新し、「有効にする」で銀行振込を設定してください",
    };
  }

  if (targetPlan === "corporate" || targetPlan === "corporate_premium") {
    const { error: orgError } = await admin.rpc("ensure_organization_exists", {
      uid: sub.user_id,
    });
    if (orgError) {
      console.error("[switchStripeToBankTransferAction] ensure_organization_exists failed", orgError);
    }
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_switch_from_stripe",
    targetType: "subscription",
    targetId: subscriptionId,
    metadata: {
      user_id: sub.user_id,
      from_plan: currentPlan,
      to_plan: targetPlan,
      cancelled_stripe_subscription_id: sub.stripe_subscription_id,
    },
  });
  revalidateUserPages(sub.user_id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// 動画プランの有効化（買い切り・期限なし。作り直しの再購入は許容）
// ---------------------------------------------------------------------------

export async function activateBankTransferVideoOptionAction(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = videoPlanSchema.safeParse(String(formData.get("optionType") ?? ""));
  if (!parsed.success) {
    return { success: false, error: "動画プランを選択してください" };
  }
  const optionType = parsed.data;

  const admin = createAdminClient();
  const target = await loadTargetUser(admin, userId);
  if (!target.ok) return { success: false, error: target.error };

  const startIso = new Date().toISOString();
  const insert = await admin
    .from("option_subscriptions")
    .insert({
      user_id: userId,
      payment_type: "one_time",
      payment_method: "bank_transfer",
      option_type: optionType,
      status: "active",
      start_date: startIso,
      end_date: null,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    console.error("[activateBankTransferVideoOptionAction] insert failed", insert.error);
    return { success: false, error: GENERIC_ERROR };
  }

  await sendVideoActivatedEmails(admin, sendEmail, userId, optionType, startIso);

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_option_activate",
    targetType: "option_subscription",
    targetId: insert.data.id,
    metadata: { user_id: userId, option_type: optionType },
  });
  revalidateUserPages(userId);
  return { success: true };
}
