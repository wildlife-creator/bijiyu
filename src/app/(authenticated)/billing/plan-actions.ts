"use server";

import { comparePlans } from "@/lib/billing/compare-plans";
import { getStripeClient } from "@/lib/billing/stripe";
import { validateDowngradePrerequisites } from "@/lib/billing/validate-downgrade";
import {
  ACTION_TYPES,
  PLAN_LABELS,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveSubscription {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  stripe_subscription_id: string;
  schedule_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

interface ChangePlanResult {
  performedType: "upgrade" | "downgrade";
  newPlanName: string;
  scheduledAt?: string;
}

interface CancelReservationResult {
  cancelledType: "downgrade" | "cancel";
  previousTargetPlan?: string;
}

// ---------------------------------------------------------------------------
// Shared auth + subscription fetch helper
// ---------------------------------------------------------------------------

async function getAuthenticatedClientSubscription(): Promise<
  | { success: true; userId: string; subscription: ActiveSubscription }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインしてください" };

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!userRow) return { success: false, error: "ユーザー情報の取得に失敗しました" };
  if (userRow.role === "staff")
    return { success: false, error: "担当者アカウントではプランの変更はできません" };
  if (userRow.role !== "client")
    return { success: false, error: "有料プランにご加入後にお手続きいただけます" };

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select(
      "id, user_id, plan_type, status, stripe_subscription_id, schedule_id, cancel_at_period_end, current_period_end",
    )
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || !sub.stripe_subscription_id) {
    return { success: false, error: "有効なサブスクリプションが見つかりません" };
  }

  return {
    success: true,
    userId: user.id,
    subscription: sub as ActiveSubscription,
  };
}

// ---------------------------------------------------------------------------
// 6.6 changePlanAction — 唯一の外部公開 API
// ---------------------------------------------------------------------------

export async function changePlanAction(input: {
  targetPlan: PaidPlanType;
}): Promise<ActionResult<ChangePlanResult>> {
  const auth = await getAuthenticatedClientSubscription();
  if (!auth.success) return auth;

  const { userId, subscription } = auth;
  const currentPlan = subscription.plan_type as PlanType;
  const targetPlan = input.targetPlan;

  // past_due check
  if (subscription.status === "past_due") {
    return {
      success: false,
      error:
        "お支払いが確認できていないため、プラン変更ができません。お支払い方法を更新するか、解約をお選びください",
    };
  }

  // 予約状態チェック（Gap 1）
  if (subscription.schedule_id || subscription.cancel_at_period_end) {
    return {
      success: false,
      error: "予約をキャンセルしてからプラン変更してください",
    };
  }

  const comparison = comparePlans(currentPlan, targetPlan);

  if (comparison === "same") {
    return { success: false, error: "同じプランへの変更はできません" };
  }

  if (comparison === "upgrade") {
    return await upgradePlanAction(subscription, targetPlan);
  }

  // downgrade
  return await scheduleDowngradeAction(userId, subscription, targetPlan);
}

// ---------------------------------------------------------------------------
// 6.2 upgradePlanAction (internal)
// ---------------------------------------------------------------------------

async function upgradePlanAction(
  subscription: ActiveSubscription,
  targetPlan: PaidPlanType,
): Promise<ActionResult<ChangePlanResult>> {
  const stripe = getStripeClient();

  // Retrieve the current subscription to get item ID
  const stripeSub = await stripe.subscriptions.retrieve(
    subscription.stripe_subscription_id,
  );
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) {
    return {
      success: false,
      error: "サブスクリプション情報の取得に失敗しました",
    };
  }

  const newPriceId = priceIdForPlan(targetPlan);
  if (!newPriceId) {
    return {
      success: false,
      error: "プランの価格設定が見つかりません",
    };
  }

  try {
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "create_prorations",
    });
  } catch (err) {
    console.error("[upgradePlanAction] stripe.subscriptions.update failed", err);
    return {
      success: false,
      error: "プラン変更に失敗しました。しばらくしてから再度お試しください",
    };
  }

  // Webhook 処理を待たず、UI 表示に必要な DB 更新を同期的に行う。
  // Webhook（handle_subscription_lifecycle_updated）でも同じ更新が実行されるが、
  // 冪等な操作なので二重実行しても安全。
  // これにより、クライアントが直後にページ遷移した時点でガードチェックを通過できる。
  const admin = createAdminClient();

  // 1. subscriptions.plan_type を先行更新
  const { error: planUpdateError } = await admin
    .from("subscriptions")
    .update({ plan_type: targetPlan })
    .eq("id", subscription.id);
  if (planUpdateError) {
    console.error(
      "[upgradePlanAction] subscriptions plan_type update failed",
      planUpdateError,
    );
    // Webhook で再度更新されるため続行
  }

  // 2. 法人プランへのアップグレード時は organizations を確保
  if (targetPlan === "corporate" || targetPlan === "corporate_premium") {
    const { error: ensureOrgError } = await admin.rpc(
      "ensure_organization_exists",
      { uid: subscription.user_id },
    );
    if (ensureOrgError) {
      console.error(
        "[upgradePlanAction] ensure_organization_exists failed",
        ensureOrgError,
      );
    }
  }

  return {
    success: true,
    data: {
      performedType: "upgrade",
      newPlanName: PLAN_LABELS[targetPlan],
    },
  };
}

// ---------------------------------------------------------------------------
// 6.3 scheduleDowngradeAction (internal)
// ---------------------------------------------------------------------------

async function scheduleDowngradeAction(
  userId: string,
  subscription: ActiveSubscription,
  targetPlan: PaidPlanType,
): Promise<ActionResult<ChangePlanResult>> {
  const admin = createAdminClient();
  const currentPlan = subscription.plan_type as PlanType;

  // Validate prerequisites
  const validation = await validateDowngradePrerequisites(
    admin,
    userId,
    currentPlan,
    targetPlan,
  );
  if (!validation.ok) {
    return { success: false, error: validation.errors.join("\n") };
  }

  const stripe = getStripeClient();
  const newPriceId = priceIdForPlan(targetPlan);
  if (!newPriceId) {
    return { success: false, error: "プランの価格設定が見つかりません" };
  }

  try {
    // Create a Schedule from the existing subscription
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.stripe_subscription_id,
    });

    // The current phase is phases[0]. Add a second phase with the target price.
    const currentPhase = schedule.phases[0];
    if (!currentPhase) {
      return { success: false, error: "スケジュール情報の取得に失敗しました" };
    }

    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          items: currentPhase.items.map((item) => ({
            price: typeof item.price === "string" ? item.price : item.price.id,
            quantity: item.quantity,
          })),
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
        },
      ],
    });

    // Webhook will pick up the subscription.updated event and sync schedule_id
    // + scheduled_plan_type + scheduled_at to local DB

    return {
      success: true,
      data: {
        performedType: "downgrade",
        newPlanName: PLAN_LABELS[targetPlan],
        scheduledAt: subscription.current_period_end ?? undefined,
      },
    };
  } catch (err) {
    console.error("[scheduleDowngradeAction] Stripe API failed", err);
    return {
      success: false,
      error:
        "ダウングレード予約に失敗しました。しばらくしてから再度お試しください",
    };
  }
}

// ---------------------------------------------------------------------------
// 6.3 cancelDowngradeReservationAction
// ---------------------------------------------------------------------------

export async function cancelDowngradeReservationAction(): Promise<
  ActionResult<CancelReservationResult>
> {
  const auth = await getAuthenticatedClientSubscription();
  if (!auth.success) return auth;

  const { subscription } = auth;
  const stripe = getStripeClient();
  const admin = createAdminClient();

  try {
    // Retrieve the live subscription to check current state
    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id,
    );

    const scheduleId =
      typeof stripeSub.schedule === "string"
        ? stripeSub.schedule
        : stripeSub.schedule?.id ?? null;

    if (scheduleId) {
      // Downgrade reservation → release the Schedule
      await stripe.subscriptionSchedules.release(scheduleId);

      // audit_logs
      await admin.from("audit_logs").insert({
        actor_id: auth.userId,
        action: ACTION_TYPES.subscription_reservation_cancelled,
        target_type: "subscription",
        target_id: subscription.id,
        metadata: { cancelled_schedule_id: scheduleId },
      });

      return {
        success: true,
        data: {
          cancelledType: "downgrade",
          previousTargetPlan: subscription.schedule_id
            ? PLAN_LABELS[
                (subscription.plan_type as PlanType) ?? "free"
              ]
            : undefined,
        },
      };
    }

    if (stripeSub.cancel_at_period_end) {
      // Cancel reservation → undo cancel_at_period_end
      await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        { cancel_at_period_end: false },
      );

      await admin.from("audit_logs").insert({
        actor_id: auth.userId,
        action: ACTION_TYPES.subscription_reservation_cancelled,
        target_type: "subscription",
        target_id: subscription.id,
        metadata: { cancelled_type: "cancel_at_period_end" },
      });

      return { success: true, data: { cancelledType: "cancel" } };
    }

    // Neither reservation exists → idempotent success
    return {
      success: true,
      data: { cancelledType: "cancel" },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    if (
      message.includes("resource_missing") ||
      message.includes("canceled")
    ) {
      return {
        success: false,
        error:
          "解約処理が既に完了したため、取り消しできません。プラン案内画面を再度ご確認ください",
      };
    }
    console.error(
      "[cancelDowngradeReservationAction] Stripe API failed",
      err,
    );
    return {
      success: false,
      error:
        "予約のキャンセルに失敗しました。しばらくしてから再度お試しください",
    };
  }
}

// ---------------------------------------------------------------------------
// 6.4 scheduleCancelAction
// ---------------------------------------------------------------------------

export async function scheduleCancelAction(): Promise<ActionResult> {
  const auth = await getAuthenticatedClientSubscription();
  if (!auth.success) return auth;

  const { userId, subscription } = auth;

  if (subscription.status === "past_due") {
    return {
      success: false,
      error:
        "お支払い遅延中は通常の解約予約はできません。即時解約をお選びください",
    };
  }

  const admin = createAdminClient();
  const validation = await validateDowngradePrerequisites(
    admin,
    userId,
    subscription.plan_type as PlanType,
    "free",
  );
  if (!validation.ok) {
    return { success: false, error: validation.errors.join("\n") };
  }

  const stripe = getStripeClient();
  try {
    await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: true },
    );
  } catch (err) {
    console.error("[scheduleCancelAction] Stripe API failed", err);
    return {
      success: false,
      error: "解約予約に失敗しました。しばらくしてから再度お試しください",
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// 6.4 cancelImmediatelyAction (past_due only)
// ---------------------------------------------------------------------------

export async function cancelImmediatelyAction(): Promise<ActionResult> {
  const auth = await getAuthenticatedClientSubscription();
  if (!auth.success) return auth;

  const { subscription } = auth;

  if (subscription.status !== "past_due") {
    return {
      success: false,
      error:
        "即時解約はお支払い遅延中の場合のみご利用いただけます",
    };
  }

  const stripe = getStripeClient();
  try {
    await stripe.subscriptions.cancel(
      subscription.stripe_subscription_id,
    );
  } catch (err) {
    console.error("[cancelImmediatelyAction] Stripe API failed", err);
    return {
      success: false,
      error: "解約に失敗しました。しばらくしてから再度お試しください",
    };
  }

  // DB state change flows through the customer.subscription.deleted webhook
  return { success: true };
}

// ---------------------------------------------------------------------------
// 6.5 cancelCompensationAction
// ---------------------------------------------------------------------------

export async function cancelCompensationAction(input: {
  optionSubscriptionId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインしてください" };

  const admin = createAdminClient();
  const { data: opt } = await admin
    .from("option_subscriptions")
    .select("id, user_id, stripe_subscription_id, option_type, status")
    .eq("id", input.optionSubscriptionId)
    .maybeSingle();

  if (!opt || opt.user_id !== user.id) {
    return {
      success: false,
      error: "対象の補償オプションが見つかりません",
    };
  }

  if (opt.status !== "active") {
    return {
      success: false,
      error: "このオプションは既に解約されています",
    };
  }

  if (!opt.stripe_subscription_id) {
    return {
      success: false,
      error: "サブスクリプション情報が見つかりません",
    };
  }

  const stripe = getStripeClient();
  try {
    await stripe.subscriptions.cancel(opt.stripe_subscription_id);
  } catch (err) {
    console.error("[cancelCompensationAction] Stripe API failed", err);
    return {
      success: false,
      error: "解約に失敗しました。しばらくしてから再度お試しください",
    };
  }

  // DB update flows through customer.subscription.deleted webhook
  return { success: true };
}

// ---------------------------------------------------------------------------
// 7.1 openCustomerPortalAction
// ---------------------------------------------------------------------------

export async function openCustomerPortalAction(): Promise<
  ActionResult<{ portalUrl: string }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインしてください" };

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!userRow?.stripe_customer_id) {
    return {
      success: false,
      error: "お支払い情報が登録されていません",
    };
  }

  const stripe = getStripeClient();
  const portalConfigId = process.env.STRIPE_PORTAL_CONFIGURATION_ID;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: userRow.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/billing`,
      ...(portalConfigId ? { configuration: portalConfigId } : {}),
    });

    return { success: true, data: { portalUrl: session.url } };
  } catch (err) {
    console.error("[openCustomerPortalAction] Stripe API failed", err);
    return {
      success: false,
      error:
        "お支払い情報ページの表示に失敗しました。しばらくしてから再度お試しください",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priceIdForPlan(planType: PaidPlanType): string | null {
  switch (planType) {
    case "individual":
      return process.env.STRIPE_PRICE_INDIVIDUAL ?? null;
    case "small":
      return process.env.STRIPE_PRICE_SMALL ?? null;
    case "corporate":
      return process.env.STRIPE_PRICE_CORPORATE ?? null;
    case "corporate_premium":
      return process.env.STRIPE_PRICE_CORPORATE_PREMIUM ?? null;
  }
}
