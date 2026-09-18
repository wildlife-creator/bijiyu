/**
 * 契約ライフサイクル Webhook（handle-subscription-lifecycle.ts）から送るメール。
 * 変更 / 解約 / 支払い失敗 / オプション解約 の通知と、差分ベースの送信判定（maybeSendChangedEmail）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send-email";
import { OPTION_LABELS, type OptionType } from "@/lib/billing/options";
import { optionPaymentFailedEmail } from "@/lib/email/templates/option-payment-failed";
import {
  optionSubscriptionCancelledEmail,
  type OptionCancellationReason,
} from "@/lib/email/templates/option-subscription-cancelled";
import { paymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import {
  subscriptionChangedEmail,
  type SubscriptionChangedEventType,
} from "@/lib/email/templates/subscription-changed";
import {
  PLAN_LABELS,
  planDisplayName,
  type BillingCycle,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import type { Database } from "@/types/database";
import type { SubscriptionSnapshot } from "./handle-subscription-lifecycle";

export interface PostUpdateState {
  planType: PaidPlanType;
  billingCycle: BillingCycle;
  scheduleId: string | null;
  scheduledPlanType: string | null;
  scheduledBillingCycle: BillingCycle | null;
  scheduledAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Decide which subscriptionChangedEmail variant to send (if any) and dispatch.
 *
 * §6.1 サブケース (webhook 判定軸):
 *   (a) plan_type changed, before.schedule_id == null  → upgrade-immediate (A-1)
 *   (a') plan_type changed, before.schedule_id != null → downgrade-applied (A-1')
 *        = ダウングレード予約 (b) が期末に適用されたケース。予約時と件名を分ける
 *   (b) schedule_id null → non-null                    → downgrade-reserved (A-2)
 *   (c) cancel_at_period_end false → true              → cancel-reserved (B)
 *   (d-1) schedule_id non-null → null                  → reservation-removed-downgrade (C-1)
 *   (d-2) cancel_at_period_end true → false            → reservation-removed-cancel (C-2)
 *   else → no email
 *
 * (d-1) / (d-2) は webhook 上検知パスが異なるため別ケースとして発火する。
 */
export async function maybeSendChangedEmail(
  admin: SupabaseClient<Database>,
  before: SubscriptionSnapshot,
  after: PostUpdateState,
  send: typeof sendEmail,
): Promise<void> {
  // (a) Upgrade — plan_type changed.
  // A5: 通常はここで送らない。upgradePlanAction (Server Action) が
  // Stripe 呼び出し成功直後に subscriptions.plan_type を先行 UPDATE してから
  // 「【ビジ友】プラン変更を承りました」メールを同期送信するため、
  // Webhook 到着時には before.plan_type === after.planType になっていて
  // ここに入らない。フォールバック（先行 UPDATE の失敗など）では
  // Webhook 側でもこの分岐で送信され、ユーザーが一切メールを受け取らない事態を防ぐ。
  //
  // (a') ダウングレード予約の期末適用もここに入る（Stripe の Subscription Schedule が
  // 次フェーズに進むと subscription.updated が plan_type 変化として届く）。
  // 直前スナップショットに schedule_id があれば「予約の適用」と判定し、予約時
  // （A-2「承りました」）と件名を分けた「プラン変更が完了しました」を送る。
  // 予約あり状態では他プランへの即時アップグレードは UI で非活性のため、
  // schedule_id の有無で A-1 / A-1' を一意に切り分けられる。
  //
  // アップグレード（上位プラン / 月払い→年払い）は Stripe ホスト画面
  // （subscription_update_confirm）で確定するため Server Action の先行 UPDATE は無く、
  // この Webhook 分岐が「【ビジ友】プラン変更を承りました」の本経路になる。
  // 支払サイクルだけが変わった場合（同一プランで月→年）もここで通知する。
  const beforeCycle: BillingCycle = before.billing_cycle ?? "monthly";
  if (before.plan_type !== after.planType || beforeCycle !== after.billingCycle) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType:
        before.schedule_id != null ? "downgrade-applied" : "upgrade-immediate",
      oldPlanName: planDisplayName(before.plan_type as PlanType, beforeCycle),
      newPlanName: planDisplayName(after.planType, after.billingCycle),
    });
    return;
  }

  // (b) Downgrade reservation appeared
  if (before.schedule_id == null && after.scheduleId != null) {
    const newPlan = (after.scheduledPlanType as PlanType) ?? after.planType;
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "downgrade-reserved",
      oldPlanName: planDisplayName(before.plan_type as PlanType, beforeCycle),
      newPlanName: planDisplayName(newPlan, after.scheduledBillingCycle ?? after.billingCycle),
      scheduledDate: formatDate(after.scheduledAt),
    });
    return;
  }

  // (c) Cancel reservation appeared.
  // A5-follow-up: 通常はここで送らない。scheduleCancelAction が cancel_at_period_end
  // を先行 UPDATE してから「【ビジ友】解約をご予約いただきました」を同期送信するため、
  // Webhook 到着時には before.cancel_at_period_end === after.cancelAtPeriodEnd === true
  // になっていてここに入らない。先行 UPDATE 失敗時のフォールバックとしてのみ発火する。
  if (!before.cancel_at_period_end && after.cancelAtPeriodEnd) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "cancel-reserved",
      endDate: formatDate(after.currentPeriodEnd),
    });
    return;
  }

  // (d-1) Downgrade reservation removed (schedule_id non-null → null).
  // A5-follow-up: 通常はここで送らない。cancelDowngradeReservationAction が
  // schedule_id / scheduled_plan_type / scheduled_at を先行 UPDATE で null にしてから
  // 「【ビジ友】ご予約を取り消しました」を同期送信するため、Webhook 到着時には
  // before.schedule_id も null になっていてここに入らない。フォールバック分岐。
  if (before.schedule_id != null && after.scheduleId == null) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "reservation-removed-downgrade",
      planName: planDisplayName(before.plan_type as PlanType, beforeCycle),
    });
    return;
  }

  // (d-2) Cancel reservation removed (cancel_at_period_end true → false).
  // A5-follow-up: 通常はここで送らない。cancelDowngradeReservationAction が
  // cancel_at_period_end を先行 UPDATE で false にしてから「【ビジ友】ご予約を取り消しました」
  // を同期送信するため、Webhook 到着時には before.cancel_at_period_end も false に
  // なっていてここに入らない。フォールバック分岐。
  if (before.cancel_at_period_end && !after.cancelAtPeriodEnd) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "reservation-removed-cancel",
      planName: planDisplayName(before.plan_type as PlanType, beforeCycle),
    });
    return;
  }

  // No diff worth notifying
}

export interface ChangedEmailParams {
  eventType: SubscriptionChangedEventType;
  oldPlanName?: string;
  newPlanName?: string;
  planName?: string;
  scheduledDate?: string;
  endDate?: string;
}

export async function sendChangedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  params: ChangedEmailParams,
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const tpl = subscriptionChangedEmail({
      recipientName: recipient.name,
      ...params,
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[handleSubscriptionLifecycle] sendChangedEmail failed", err);
  }
}

export async function sendCancelledEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  planType: PlanType,
  reason: "manual" | "auto-past-due" = "manual",
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const tpl = subscriptionCancelledEmail({
      recipientName: recipient.name,
      planName: PLAN_LABELS[planType],
      cancelledAt: formatDate(new Date().toISOString()),
      reason,
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleSubscriptionLifecycle] sendCancelledEmail failed",
      err,
    );
  }
}

export async function sendPaymentFailedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  planType: PlanType,
  nextRetryEpochSeconds: number | null,
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const nextRetryDate = nextRetryEpochSeconds
      ? formatDate(new Date(nextRetryEpochSeconds * 1000).toISOString())
      : "近日中";
    const tpl = paymentFailedEmail({
      recipientName: recipient.name,
      planName: PLAN_LABELS[planType],
      nextRetryDate,
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleSubscriptionLifecycle] sendPaymentFailedEmail failed",
      err,
    );
  }
}

export async function sendOptionPaymentFailedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  optionType: OptionType,
  nextRetryEpochSeconds: number | null,
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const nextRetryDate = nextRetryEpochSeconds
      ? formatDate(new Date(nextRetryEpochSeconds * 1000).toISOString())
      : "近日中";
    const tpl = optionPaymentFailedEmail({
      recipientName: recipient.name,
      optionLabel: OPTION_LABELS[optionType],
      nextRetryDate,
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleSubscriptionLifecycle] sendOptionPaymentFailedEmail failed",
      err,
    );
  }
}

export async function sendOptionCancelledEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  optionType: OptionType,
  reason: OptionCancellationReason,
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const tpl = optionSubscriptionCancelledEmail({
      recipientName: recipient.name,
      optionLabel: OPTION_LABELS[optionType],
      cancelledAt: formatDate(new Date().toISOString()),
      reason,
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleSubscriptionLifecycle] sendOptionCancelledEmail failed",
      err,
    );
  }
}

export async function fetchRecipient(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const result = await admin
    .from("users")
    .select("email, last_name, first_name, client_profiles(display_name)")
    .eq("id", userId)
    .maybeSingle();
  if (!result.data) return null;
  // 発注者表示名は client_profiles.display_name に一本化（Task 4.5）。
  // 個人名はスペースなし結合（CLAUDE.md ルール）。
  const profiles = result.data.client_profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  const displayName = profile?.display_name?.trim() ?? "";
  const personalName = `${result.data.last_name ?? ""}${result.data.first_name ?? ""}`;
  const name = displayName || personalName || "お客様";
  return { email: result.data.email, name };
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
