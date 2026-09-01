"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE } from "@/lib/billing/bank-transfer";
import { comparePlanChange } from "@/lib/billing/compare-plans";
import { getStripeClient } from "@/lib/billing/stripe";
import { extractPeriodEnd } from "@/lib/billing/subscription-periods";
import { validateDowngradePrerequisites } from "@/lib/billing/validate-downgrade";
import {
  ACTION_TYPES,
  PLAN_LABELS,
  planDisplayName,
  priceIdFor,
  type BillingCycle,
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
  /** P3: 月払い / 年払い */
  billing_cycle: BillingCycle;
  status: string;
  stripe_subscription_id: string;
  schedule_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

/**
 * P3: アップグレード（上位プラン / 月払い→年払い）は Stripe ホスト画面で確定するため、
 * Server Action は遷移先 URL を返すだけ（DB 更新・メールは Webhook が担う）。
 * ダウングレードは従来どおり期末切替の予約。
 */
export type ChangePlanResult =
  | { performedType: "upgrade"; newPlanName: string; portalUrl: string }
  | { performedType: "downgrade"; newPlanName: string; scheduledAt?: string };

export interface ChangePlanInput {
  targetPlan: PaidPlanType;
  /** 省略時は現在の支払サイクルを維持 */
  targetCycle?: BillingCycle;
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
      "id, user_id, plan_type, billing_cycle, status, stripe_subscription_id, schedule_id, cancel_at_period_end, current_period_end, payment_method",
    )
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 銀行振込契約（P2）は Stripe にサブスクが無く、変更・解約・期限延長は運営が
  // 管理画面で行う（D3 / D6）。この画面の Stripe 前提の操作には流入させない
  if (sub && sub.payment_method === "bank_transfer") {
    return {
      success: false,
      error: BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE,
    };
  }

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

export async function changePlanAction(
  input: ChangePlanInput,
): Promise<ActionResult<ChangePlanResult>> {
  const auth = await getAuthenticatedClientSubscription();
  if (!auth.success) return auth;

  const { userId, subscription } = auth;
  const currentPlan = subscription.plan_type as PlanType;
  const currentCycle: BillingCycle = subscription.billing_cycle ?? "monthly";
  const targetPlan = input.targetPlan;
  const targetCycle: BillingCycle = input.targetCycle ?? currentCycle;

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

  const comparison = comparePlanChange(
    { planType: currentPlan, billingCycle: currentCycle },
    { planType: targetPlan, billingCycle: targetCycle },
  );

  if (comparison === "same") {
    return { success: false, error: "同じプランへの変更はできません" };
  }

  if (comparison === "upgrade") {
    return await createUpgradePortalSession(userId, subscription, targetPlan, targetCycle);
  }

  // downgrade（年払い → 月払いの同一プラン切替も含む）
  return await scheduleDowngradeAction(userId, subscription, targetPlan, targetCycle);
}

// ---------------------------------------------------------------------------
// 6.2 createUpgradePortalSession (internal) — P3: Stripe ホスト画面でのアップグレード
// ---------------------------------------------------------------------------

/**
 * アップグレード（上位プラン / 月払い→年払い）は Stripe Customer Portal の
 * `subscription_update_confirm` フローに委ねる（spec-changes-202608 §2.1(3) / D5）。
 * 変更後プラン・日割り差額・次回請求の表示、決済失敗・3D セキュアは Stripe 側で処理。
 *
 * 確定後は `customer.subscription.updated` Webhook が plan_type / billing_cycle の変化を
 * 検知して DB を更新し、「【ビジ友】プラン変更を承りました」を送る
 * （handle-subscription-lifecycle.ts の (a) 分岐）。ここでは DB 更新・メール送信を行わない
 * ＝ A5 の先行 UPDATE / 先行送信は廃止（ホスト画面で離脱・失敗した場合に DB だけ進む事故を防ぐ）。
 *
 * ポータル設定は STRIPE_PORTAL_UPDATE_CONFIGURATION_ID（プラン変更を許可した専用設定、
 * scripts/stripe/setup-yearly-prices.mjs が作成）。既存の STRIPE_PORTAL_CONFIGURATION_ID
 * （カード更新 + 請求履歴のみ）とは分ける。
 */
async function createUpgradePortalSession(
  userId: string,
  subscription: ActiveSubscription,
  targetPlan: PaidPlanType,
  targetCycle: BillingCycle,
): Promise<ActionResult<ChangePlanResult>> {
  const stripe = getStripeClient();

  const newPriceId = priceIdFor(targetPlan, targetCycle);
  if (!newPriceId) {
    return {
      success: false,
      error: "プランの価格設定が見つかりません",
    };
  }

  // Stripe サブスクの item ID と customer を取得
  let itemId: string | undefined;
  let customerId: string | undefined;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id,
    );
    itemId = stripeSub.items.data[0]?.id;
    customerId =
      typeof stripeSub.customer === "string"
        ? stripeSub.customer
        : stripeSub.customer?.id;
  } catch (err) {
    console.error("[createUpgradePortalSession] stripe.subscriptions.retrieve failed", err);
  }
  if (!itemId || !customerId) {
    return {
      success: false,
      error: "サブスクリプション情報の取得に失敗しました",
    };
  }

  const updateConfigId = process.env.STRIPE_PORTAL_UPDATE_CONFIGURATION_ID;
  if (!updateConfigId) {
    console.error(
      "[createUpgradePortalSession] STRIPE_PORTAL_UPDATE_CONFIGURATION_ID is not set",
    );
    return {
      success: false,
      error: "プラン変更の設定が未完了です。管理者にお問い合わせください",
    };
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000"}/billing?plan_change=confirmed`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: updateConfigId,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: subscription.stripe_subscription_id,
          items: [{ id: itemId, price: newPriceId, quantity: 1 }],
        },
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    });

    // 監査: 遷移した事実だけ残す（確定は Webhook 側の subscription_updated で記録される）
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: ACTION_TYPES.subscription_updated,
      target_type: "subscription",
      target_id: subscription.id,
      metadata: {
        step: "portal_session_created",
        from: { plan_type: subscription.plan_type, billing_cycle: subscription.billing_cycle },
        to: { plan_type: targetPlan, billing_cycle: targetCycle },
      },
    });

    return {
      success: true,
      data: {
        performedType: "upgrade",
        newPlanName: planDisplayName(targetPlan, targetCycle),
        portalUrl: session.url,
      },
    };
  } catch (err) {
    console.error("[createUpgradePortalSession] billingPortal.sessions.create failed", err);
    return {
      success: false,
      error: "プラン変更画面の表示に失敗しました。しばらくしてから再度お試しください",
    };
  }
}

/**
 * A5-follow-up: subscriptionChangedEmail の 3 バリアント
 * （cancel-reserved / reservation-removed-downgrade / reservation-removed-cancel）を
 * Server Action から同期送信するための共通ヘルパー。
 * ※ upgrade-immediate は P3 で Stripe ホスト画面化に伴い Webhook 側の送信に一本化した。
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
  targetCycle: BillingCycle,
): Promise<ActionResult<ChangePlanResult>> {
  const admin = createAdminClient();
  const currentPlan = subscription.plan_type as PlanType;

  // Validate prerequisites（同一プランで年払い→月払いの場合は制限が変わらないので自然に通る）
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
  const newPriceId = priceIdFor(targetPlan, targetCycle);
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
        newPlanName: planDisplayName(targetPlan, targetCycle),
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
          scheduled_billing_cycle: null,
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
        planName: planDisplayName(subscription.plan_type as PlanType, subscription.billing_cycle),
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
  let updatedSub;
  try {
    updatedSub = await stripe.subscriptions.update(
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

  // 解約終了日（＝有料プランでご利用いただける最終日）は Stripe の応答から
  // 直接取り出す。DB の current_period_end は customer.subscription.updated
  // Webhook が届くまで null のことがあり（契約直後・Webhook 遅延・エンドポイントの
  // API version ズレ等）、それに依存すると画面・メールで日付が空欄になる不具合が
  // 出る。Stripe 応答に無い場合のみ DB 値へフォールバックする。
  const periodEndIso =
    extractPeriodEnd(updatedSub) ?? subscription.current_period_end;

  // A6: Webhook 到着前の再描画で解約予約状態が反映されるように DB を先行更新。
  // 併せて、上で確定した終了日も先行保存しておく（画面の「〜に解約予定」が
  // Webhook を待たずに正しい日付で表示される）。Webhook（handle_subscription_
  // lifecycle_updated）でも同じ値が入るため冪等。
  const { error: preUpdateError } = await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      ...(periodEndIso ? { current_period_end: periodEndIso } : {}),
    })
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
    endDate: formatDateJst(periodEndIso),
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

  // Staff は課金アクション不可（契約主体は Owner 単一）。所有権チェックでも
  // 弾かれるが、明示ガードで正しいエラー文言を返す（三重防御）。
  const { data: roleRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (roleRow?.role === "staff") {
    return {
      success: false,
      error: "担当者アカウントではオプションの解約はできません",
    };
  }

  const admin = createAdminClient();
  const { data: opt } = await admin
    .from("option_subscriptions")
    .select("id, user_id, stripe_subscription_id, option_type, status, payment_method")
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

  // 銀行振込で契約した補償（P2）は Stripe に無い。解約は運営に連絡（手動運用）
  if (opt.payment_method === "bank_transfer") {
    return {
      success: false,
      error: BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE,
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

  // Staff は Owner のサブスクに相乗りするだけで支払い情報を持たない
  const { data: roleRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (roleRow?.role === "staff") {
    return {
      success: false,
      error: "担当者アカウントではお支払い情報の管理はできません",
    };
  }

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

