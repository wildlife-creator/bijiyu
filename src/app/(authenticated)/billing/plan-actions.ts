"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { comparePlans } from "@/lib/billing/compare-plans";
import { getStripeClient } from "@/lib/billing/stripe";
import { validateDowngradePrerequisites } from "@/lib/billing/validate-downgrade";
import {
  ACTION_TYPES,
  PLAN_LABELS,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import { sendEmail } from "@/lib/email/send-email";
import {
  subscriptionChangedEmail,
  type SubscriptionChangedEventType,
} from "@/lib/email/templates/subscription-changed";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";
import type { Database } from "@/types/database";
import { formatDateJst } from "@/lib/utils/format-date";

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

  // A5: 「【ビジ友】プラン変更を承りました」メールを Server Action から同期送信する。
  // Webhook 側（handle_subscription_lifecycle_updated (a) 分岐）は
  // 「snapshot.plan_type と after.planType の差分」でメール送信を判定するため、
  // 上記の先行 UPDATE で snapshot が新プランに揃うと差分が消えて自然に skip される
  // ＝ 二重送信にはならない。詳細は handle-subscription-lifecycle.ts の (a) 分岐コメント参照。
  await sendSubscriptionChangedEmail(admin, subscription.user_id, {
    eventType: "upgrade-immediate",
    oldPlanName: PLAN_LABELS[subscription.plan_type as PlanType],
    newPlanName: PLAN_LABELS[targetPlan],
  });

  return {
    success: true,
    data: {
      performedType: "upgrade",
      newPlanName: PLAN_LABELS[targetPlan],
    },
  };
}

/**
 * A5 / A5-follow-up: subscriptionChangedEmail の 4 バリアント
 * （upgrade-immediate / cancel-reserved / reservation-removed-downgrade
 *   / reservation-removed-cancel）を Server Action から同期送信するための共通ヘルパー。
 *
 * 背景: Webhook (handle_subscription_lifecycle_updated) の (a)/(c)/(d-1)/(d-2)
 * 分岐は「snapshot と after の差分」でメール送信を判定するが、対応する
 * Server Action が先行 UPDATE で DB を新状態に書き換えるため、Webhook 到着時には
 * 差分が消えて skip されてしまう。よって Server Action 側で送信するのが正規経路、
 * Webhook 側は先行 UPDATE 失敗時のフォールバックという位置付け。
 *
 * 失敗しても Server Action の成功可否には影響させない（try/catch でログのみ）。
 * 受信者名の解決ルールは handle-subscription-lifecycle.ts の fetchRecipient と同じ:
 * client_profiles.display_name → 姓+名（スペースなし結合）→ "お客様"。
 */
async function sendSubscriptionChangedEmail(
  admin: SupabaseClient<Database>,
  userId: string,
  params: {
    eventType: SubscriptionChangedEventType;
    oldPlanName?: string;
    newPlanName?: string;
    planName?: string;
    scheduledDate?: string;
    endDate?: string;
  },
): Promise<void> {
  try {
    const { data } = await admin
      .from("users")
      .select("email, last_name, first_name, client_profiles(display_name)")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return;

    const profiles = data.client_profiles;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const displayName = profile?.display_name?.trim() ?? "";
    const personalName = `${data.last_name ?? ""}${data.first_name ?? ""}`;
    const recipientName = displayName || personalName || "お客様";

    const tpl = subscriptionChangedEmail({ recipientName, ...params });
    await sendEmail({ to: data.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[plan-actions] sendSubscriptionChangedEmail failed",
      { userId, eventType: params.eventType, err },
    );
  }
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

      // A6: Webhook 到着前の再描画で予約解除状態が反映されるように DB を先行更新。
      // schedule_id 系 3 カラムを null に戻す（Webhook でも同じ更新が入る＝冪等）。
      const { error: preClearError } = await admin
        .from("subscriptions")
        .update({
          schedule_id: null,
          scheduled_plan_type: null,
          scheduled_at: null,
        })
        .eq("id", subscription.id);
      if (preClearError) {
        console.error(
          "[cancelDowngradeReservationAction] pre-clear schedule fields failed",
          preClearError,
        );
      }

      // audit_logs
      await admin.from("audit_logs").insert({
        actor_id: auth.userId,
        action: ACTION_TYPES.subscription_reservation_cancelled,
        target_type: "subscription",
        target_id: subscription.id,
        metadata: { cancelled_schedule_id: scheduleId },
      });

      // A5 と同構造の対策: 先行 UPDATE で Webhook (d-1) 分岐の diff が消えるため
      // Server Action 側で「【ビジ友】ご予約を取り消しました」（プラン変更予約取消）
      // メールを同期送信する。
      await sendSubscriptionChangedEmail(admin, subscription.user_id, {
        eventType: "reservation-removed-downgrade",
        planName: PLAN_LABELS[subscription.plan_type as PlanType],
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

      // A6: Webhook 到着前の再描画で予約解除状態が反映されるように DB を先行更新。
      const { error: preUpdateError } = await admin
        .from("subscriptions")
        .update({ cancel_at_period_end: false })
        .eq("id", subscription.id);
      if (preUpdateError) {
        console.error(
          "[cancelDowngradeReservationAction] pre-update cancel_at_period_end failed",
          preUpdateError,
        );
      }

      await admin.from("audit_logs").insert({
        actor_id: auth.userId,
        action: ACTION_TYPES.subscription_reservation_cancelled,
        target_type: "subscription",
        target_id: subscription.id,
        metadata: { cancelled_type: "cancel_at_period_end" },
      });

      // A5 と同構造の対策: 先行 UPDATE で Webhook (d-2) 分岐の diff が消えるため
      // Server Action 側で「【ビジ友】ご予約を取り消しました」（解約予約取消）
      // メールを同期送信する。
      await sendSubscriptionChangedEmail(admin, subscription.user_id, {
        eventType: "reservation-removed-cancel",
        planName: PLAN_LABELS[subscription.plan_type as PlanType],
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

  // A6: Webhook 到着前の再描画で解約予約状態が反映されるように DB を先行更新。
  // Webhook（handle_subscription_lifecycle_updated）でも同じ値が入るため冪等。
  // アップグレード側（upgradePlanAction）と同じ対策パターン。
  const { error: preUpdateError } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("id", subscription.id);
  if (preUpdateError) {
    console.error(
      "[scheduleCancelAction] pre-update cancel_at_period_end failed",
      preUpdateError,
    );
    // Webhook で再度更新されるため続行
  }

  // A5 と同構造の対策: 先行 UPDATE で Webhook (c) 分岐の diff が消えるため
  // Server Action 側で「【ビジ友】解約をご予約いただきました」メールを同期送信する。
  await sendSubscriptionChangedEmail(admin, subscription.user_id, {
    eventType: "cancel-reserved",
    endDate: formatDateJst(subscription.current_period_end),
  });

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
    // A8: Webhook 側で「手動即時解約」と「7日経過による自動解約」を
    // 区別できるよう、cancel 前に metadata フラグを付ける。
    // handle-subscription-lifecycle.ts はこの metadata を優先して
    // cancellationReason を判定する（設定できていれば "manual" 固定、
    // 設定失敗時は従来ロジック past_due_since フォールバック）。
    try {
      await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        { metadata: { bijiyu_cancel_source: "manual_immediate" } },
      );
    } catch (metaErr) {
      // metadata 更新失敗は解約自体を止めない。フォールバックで past_due_since
      // ベースの判定になる（= 従来挙動）。ログだけ残す。
      console.error(
        "[cancelImmediatelyAction] metadata update failed (fallback to legacy detection)",
        metaErr,
      );
    }
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
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000"}/billing`,
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
