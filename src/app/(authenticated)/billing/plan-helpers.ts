/**
 * プラン変更・解約の Server Action（plan-actions.ts）が使う内部処理。
 * 契約の取得 / Stripe ホスト画面（アップグレード確認）のセッション作成 / 変更メールの同期送信。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE } from "@/lib/billing/bank-transfer";
import { getStripeClient } from "@/lib/billing/stripe";
import {
  ACTION_TYPES,
  planDisplayName,
  priceIdFor,
  type BillingCycle,
  type PaidPlanType,
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
import type { ChangePlanResult } from "./plan-actions";

export interface ActiveSubscription {
  id: string;
  user_id: string;
  plan_type: string;
  /** 月払い / 年払い */
  billing_cycle: BillingCycle;
  status: string;
  stripe_subscription_id: string;
  schedule_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

export async function getAuthenticatedClientSubscription(): Promise<
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

  // 銀行振込契約は Stripe にサブスクが無く、変更・解約・期限延長は運営が
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

/**
 * アップグレード（上位プラン / 月払い→年払い）は Stripe Customer Portal の
 * `subscription_update_confirm` フローに委ねる（docs/requirements/current-spec.md「アップグレード」）。
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
export async function createUpgradePortalSession(
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
 * ※ upgrade-immediate は Stripe ホスト画面で確定するため Webhook 側の送信に一本化している。
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
export async function sendSubscriptionChangedEmail(
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
