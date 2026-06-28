import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

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
import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";
import {
  PLAN_LABELS,
  resolvePlanTypeFromPriceId,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import type { Database } from "@/types/database";

/**
 * Optional dependency injection point for tests. The default uses the real
 * Resend-backed sendEmail.
 */
export interface LifecycleDeps {
  sendEmail?: typeof sendEmail;
  /** ISO date string for the current time (lets tests pin "today"). */
  now?: () => Date;
}

/**
 * Snapshot of the in-DB subscription row at the moment we receive a Stripe
 * lifecycle event. Captured BEFORE we apply the update so we can diff against
 * the new values to decide which email to send.
 */
interface SubscriptionSnapshot {
  id: string;
  user_id: string;
  plan_type: string;
  schedule_id: string | null;
  cancel_at_period_end: boolean;
}

export type SubscriptionLifecycleEvent =
  | { type: "customer.subscription.created"; data: Stripe.Subscription }
  | { type: "customer.subscription.updated"; data: Stripe.Subscription }
  | { type: "customer.subscription.deleted"; data: Stripe.Subscription }
  | { type: "invoice.payment_failed"; data: Stripe.Invoice }
  | { type: "invoice.payment_succeeded"; data: Stripe.Invoice };

/**
 * Top-level dispatcher for subscription lifecycle events.
 *
 * - `customer.subscription.updated`: branches on subscriptions vs option_subscriptions
 * - `customer.subscription.deleted`: same. Compensation options (受注者向け
 *   給与未払い保険) are independent contracts — no chained cancellation when
 *   the basic plan ends.
 * - `invoice.payment_failed`: marks past_due + sends paymentFailedEmail
 * - `invoice.payment_succeeded`: recovers from past_due + reactivates staff
 *
 * Throws on hard errors so the caller (withWebhookIdempotency) can record
 * the event as failed. Email send failures are logged but never throw.
 */
export async function handleSubscriptionLifecycle(
  admin: SupabaseClient<Database>,
  stripe: Stripe,
  event: SubscriptionLifecycleEvent,
  deps: LifecycleDeps = {},
): Promise<void> {
  const send = deps.sendEmail ?? sendEmail;

  switch (event.type) {
    case "customer.subscription.created":
      // Phase 5 (proxy-account-multi-org-support) で reactivateCorporateMembers を
      // 撤廃したため、本イベントでは副作用なし。subscriptions 行は
      // checkout.session.completed 経由で投入される。
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(admin, stripe, event.data, send);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(admin, event.data, send);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(admin, event.data, send);
      return;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(admin, event.data);
      return;
  }
}

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(
  admin: SupabaseClient<Database>,
  stripe: Stripe,
  sub: Stripe.Subscription,
  send: typeof sendEmail,
): Promise<void> {
  // 1. SELECT existing subscription row (capture pre-update snapshot for email diff)
  const existingSubscription = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, schedule_id, cancel_at_period_end")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existingSubscription.data) {
    const snapshot: SubscriptionSnapshot = existingSubscription.data;

    // 2. Build event_data from the live Stripe Subscription
    const newPlanType = extractPlanType(sub);
    if (!newPlanType) {
      throw new Error(
        `handleSubscriptionUpdated: unknown price id on subscription ${sub.id}`,
      );
    }

    const { scheduledPlanType, scheduledAt } =
      await resolveScheduleNextPhase(stripe, sub);

    const eventData = {
      stripe_subscription_id: sub.id,
      plan_type: newPlanType,
      status: sub.status,
      current_period_start: extractPeriodStart(sub),
      current_period_end: extractPeriodEnd(sub),
      schedule_id: extractScheduleId(sub),
      scheduled_plan_type: scheduledPlanType,
      scheduled_at: scheduledAt,
      cancel_at_period_end: sub.cancel_at_period_end,
    };

    // 3. Delegate to RPC for the multi-table atomic update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (admin as any).rpc(
      "handle_subscription_lifecycle_updated",
      { event_data: eventData },
    );
    if (rpcError) {
      throw new Error(
        `handle_subscription_lifecycle_updated RPC failed: ${rpcError.message ?? String(rpcError)}`,
      );
    }

    // 4. Diff snapshot vs new state to decide which email to send
    await maybeSendChangedEmail(admin, snapshot, {
      planType: newPlanType,
      scheduleId: eventData.schedule_id,
      scheduledPlanType: scheduledPlanType,
      scheduledAt: scheduledAt,
      currentPeriodEnd: eventData.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }, send);

    return;
  }

  // 5. Not in subscriptions — try option_subscriptions (compensation)
  const existingOption = await admin
    .from("option_subscriptions")
    .select("id, status")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existingOption.data) {
    const newStatus =
      sub.status === "active"
        ? "active"
        : sub.status === "canceled"
          ? "cancelled"
          : "active";
    const update = await admin
      .from("option_subscriptions")
      .update({ status: newStatus })
      .eq("id", existingOption.data.id);
    if (update.error) {
      throw new Error(
        `option_subscriptions update failed: ${update.error.message}`,
      );
    }
    return;
  }

  // 6. Neither hit → ordering glitch, skip silently (200)
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

async function handleSubscriptionDeleted(
  admin: SupabaseClient<Database>,
  sub: Stripe.Subscription,
  send: typeof sendEmail,
): Promise<void> {
  // 1. SELECT subscriptions
  const existingSubscription = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existingSubscription.data) {
    const userId = existingSubscription.data.user_id;
    const planType = existingSubscription.data.plan_type as PlanType;

    // §6.5 退会フロー時の suppression: ユーザーが既に退会していれば
    // E-8 退会通知に集約し、§6.2 のメール送信は skip する（DB UPDATE は
    // 通常通り RPC で実行）。判定は RPC 呼出 **前** に SELECT する。
    const userRow = await admin
      .from("users")
      .select("deleted_at")
      .eq("id", userId)
      .maybeSingle();
    const isWithdrawn = userRow.data?.deleted_at != null;

    // 2. Delegate to RPC (subscriptions UPDATE + role downgrade + staff + jobs close)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (admin as any).rpc(
      "handle_subscription_lifecycle_deleted",
      { event_data: { stripe_subscription_id: sub.id } },
    );
    if (rpcError) {
      throw new Error(
        `handle_subscription_lifecycle_deleted RPC failed: ${rpcError.message ?? String(rpcError)}`,
      );
    }

    // 3. handle_subscription_lifecycle_deleted v3: 戻り値 jsonb に
    //    globally_deleted_user_ids: uuid[] が含まれる。RPC で users.deleted_at が
    //    NULL → now() に遷移した配下メンバー全員に対し applyDeletedSuffix を呼ぶ。
    //    各呼び出しは try/catch で隔離（部分成功許容）、Webhook 全体は印付け
    //    失敗で throw しない（Stripe 再送抑制、後追いは audit_logs.auth_email_recycle_failed）。
    const globallyDeletedIds =
      ((rpcData as { globally_deleted_user_ids?: string[] } | null)
        ?.globally_deleted_user_ids ?? []);
    for (const memberUserId of globallyDeletedIds) {
      try {
        await applyDeletedSuffix(admin, memberUserId, {
          path: "subscription_deleted",
          actorId: null,
        });
      } catch (e) {
        console.error(
          "[handleSubscriptionDeleted] applyDeletedSuffix unexpected throw",
          { memberUserId, error: e },
        );
      }
    }

    // 4. 補償オプション（受注者向け給与未払い保険）は基本プランから独立した
    //    契約。基本プラン解約時の連鎖キャンセルは行わない（旧 Gap 3 ロジック
    //    廃止）。ユーザーが補償も停止したい場合は別途 cancelCompensationAction
    //    を呼ぶ。

    // 5. Send subscriptionCancelledEmail (basic plan path only)
    //    §6.5 退会 suppression: 退会済なら skip（E-8 退会通知に集約）。
    if (!isWithdrawn) {
      await sendCancelledEmail(admin, send, userId, planType);
    }
    return;
  }

  // 5. Not in subscriptions — try option_subscriptions
  const existingOption = await admin
    .from("option_subscriptions")
    .select("id, user_id, option_type")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existingOption.data) {
    const updateOption = await admin
      .from("option_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", existingOption.data.id);
    if (updateOption.error) {
      throw new Error(
        `option_subscriptions update failed: ${updateOption.error.message}`,
      );
    }

    // §6.5.C 補償オプション解約通知。
    // 退会 suppression: 退会済なら skip（E-8 退会通知に集約）。
    // 補償系は subscription mode のため `compensation_*` のみ通知対象。
    // urgent / video / video_workplace は payment mode で本パスに来ない想定だが、
    // データ異常で来た場合は通知 skip して DB 整合のみ取る。
    const optionType = existingOption.data.option_type as OptionType;
    const isCompensation =
      optionType === "compensation_5000" || optionType === "compensation_9800";
    if (isCompensation) {
      const optionUserRow = await admin
        .from("users")
        .select("deleted_at")
        .eq("id", existingOption.data.user_id)
        .maybeSingle();
      const optionUserWithdrawn = optionUserRow.data?.deleted_at != null;
      if (!optionUserWithdrawn) {
        const reason = resolveOptionCancellationReason(sub);
        await sendOptionCancelledEmail(
          admin,
          send,
          existingOption.data.user_id,
          optionType,
          reason,
        );
      }
    }
    return;
  }

  // 6. Neither hit → silently skip
}

function resolveOptionCancellationReason(
  sub: Stripe.Subscription,
): OptionCancellationReason {
  // Stripe API v2023-10-16+ で提供される `cancellation_details.reason`。
  // 既存型に未収録なケースがあるため安全に narrow する。
  const details = sub.cancellation_details;
  const reason = details?.reason;
  if (reason === "payment_failed") return "stripe-dunning";
  // `cancellation_requested` / null / unknown → 安全側で manual
  return "manual";
}

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------

async function handleInvoicePaymentFailed(
  admin: SupabaseClient<Database>,
  invoice: Stripe.Invoice,
  send: typeof sendEmail,
): Promise<void> {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return; // Non-subscription invoices are out of scope
  }

  // Look up the subscription so we know past_due_since state and user
  const existing = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, past_due_since")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (existing.data) {
    const update = await admin
      .from("subscriptions")
      .update({
        status: "past_due",
        past_due_since:
          existing.data.past_due_since ?? new Date().toISOString(),
      })
      .eq("id", existing.data.id);
    if (update.error) {
      throw new Error(
        `subscriptions past_due update failed: ${update.error.message}`,
      );
    }

    await sendPaymentFailedEmail(
      admin,
      send,
      existing.data.user_id,
      existing.data.plan_type as PlanType,
      invoice.next_payment_attempt,
    );
    return;
  }

  // §6.5.B: subscriptions に該当無し → 補償オプション分岐を試す。
  // option_subscriptions の DB 状態は変更しない (Stripe dunning に委ねる方針)。
  const existingOption = await admin
    .from("option_subscriptions")
    .select("id, user_id, option_type")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (existingOption.data) {
    const optionType = existingOption.data.option_type as OptionType;
    const isCompensation =
      optionType === "compensation_5000" || optionType === "compensation_9800";
    if (!isCompensation) {
      return; // urgent / video は payment mode のため本パスには来ない想定。来ても skip。
    }
    await sendOptionPaymentFailedEmail(
      admin,
      send,
      existingOption.data.user_id,
      optionType,
      invoice.next_payment_attempt,
    );
  }
}

// ---------------------------------------------------------------------------
// invoice.payment_succeeded
// ---------------------------------------------------------------------------

async function handleInvoicePaymentSucceeded(
  admin: SupabaseClient<Database>,
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  // Only react when the subscription was previously past_due (recovery flow)
  const existing = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, status")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!existing.data || existing.data.status !== "past_due") {
    return;
  }

  const update = await admin
    .from("subscriptions")
    .update({ status: "active", past_due_since: null })
    .eq("id", existing.data.id);
  if (update.error) {
    throw new Error(
      `subscriptions recovery update failed: ${update.error.message}`,
    );
  }

  // Phase 5 (proxy-account-multi-org-support) で配下メンバー is_active 復帰は撤廃。
  // 法人プランの「凍結」「復帰」はそもそも past_due では発生せず、解約時の
  // organization_members 行削除モデルに置き換わっている。
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPlanType(sub: Stripe.Subscription): PaidPlanType | null {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  return resolvePlanTypeFromPriceId(priceId);
}

function extractScheduleId(sub: Stripe.Subscription): string | null {
  const value = sub.schedule;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function extractPeriodStart(sub: Stripe.Subscription): string | null {
  const v = sub.items?.data?.[0]?.current_period_start;
  return typeof v === "number" ? new Date(v * 1000).toISOString() : null;
}

function extractPeriodEnd(sub: Stripe.Subscription): string | null {
  const v = sub.items?.data?.[0]?.current_period_end;
  return typeof v === "number" ? new Date(v * 1000).toISOString() : null;
}

function extractInvoiceSubscriptionId(
  invoice: Stripe.Invoice,
): string | null {
  // Stripe 2024+ moved the subscription reference under
  // invoice.parent.subscription_details.subscription. Older invoices may
  // still expose `subscription` directly, so try both.
  const parent = invoice.parent;
  if (parent?.type === "subscription_details") {
    const sub = parent.subscription_details?.subscription;
    if (sub) return typeof sub === "string" ? sub : sub.id;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = (invoice as any).subscription as
    | string
    | { id: string }
    | null
    | undefined;
  if (!legacy) return null;
  return typeof legacy === "string" ? legacy : legacy.id;
}

/**
 * Look up the next phase of a Stripe Subscription Schedule and convert its
 * price ID to a plan_type using the env-driven reverse map. Returns nulls
 * when no schedule is attached.
 */
async function resolveScheduleNextPhase(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<{ scheduledPlanType: string | null; scheduledAt: string | null }> {
  const scheduleId = extractScheduleId(sub);
  if (!scheduleId) {
    return { scheduledPlanType: null, scheduledAt: null };
  }

  let schedule: Stripe.SubscriptionSchedule;
  try {
    schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  } catch {
    return { scheduledPlanType: null, scheduledAt: null };
  }

  const nextPhase = schedule.phases?.[1];
  if (!nextPhase) {
    return { scheduledPlanType: null, scheduledAt: null };
  }

  const priceField = nextPhase.items?.[0]?.price;
  const priceId =
    typeof priceField === "string" ? priceField : (priceField?.id ?? null);
  if (!priceId) {
    return { scheduledPlanType: null, scheduledAt: null };
  }

  const planType = resolvePlanTypeFromPriceId(priceId);
  if (!planType) {
    throw new Error(`unknown price id: ${priceId}`);
  }

  const startDate = nextPhase.start_date
    ? new Date(nextPhase.start_date * 1000).toISOString()
    : null;
  return { scheduledPlanType: planType, scheduledAt: startDate };
}

interface PostUpdateState {
  planType: PaidPlanType;
  scheduleId: string | null;
  scheduledPlanType: string | null;
  scheduledAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Decide which subscriptionChangedEmail variant to send (if any) and dispatch.
 *
 * §6.1 サブケース (webhook 判定軸):
 *   (a) plan_type changed                              → upgrade-immediate (A-1)
 *   (b) schedule_id null → non-null                    → downgrade-reserved (A-2)
 *   (c) cancel_at_period_end false → true              → cancel-reserved (B)
 *   (d-1) schedule_id non-null → null                  → reservation-removed-downgrade (C-1)
 *   (d-2) cancel_at_period_end true → false            → reservation-removed-cancel (C-2)
 *   else → no email
 *
 * (d-1) / (d-2) は webhook 上検知パスが異なるため別ケースとして発火する。
 */
async function maybeSendChangedEmail(
  admin: SupabaseClient<Database>,
  before: SubscriptionSnapshot,
  after: PostUpdateState,
  send: typeof sendEmail,
): Promise<void> {
  // (a) Upgrade — plan_type changed
  if (before.plan_type !== after.planType) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "upgrade-immediate",
      oldPlanName: PLAN_LABELS[before.plan_type as PlanType],
      newPlanName: PLAN_LABELS[after.planType],
    });
    return;
  }

  // (b) Downgrade reservation appeared
  if (before.schedule_id == null && after.scheduleId != null) {
    const newPlan = (after.scheduledPlanType as PlanType) ?? after.planType;
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "downgrade-reserved",
      oldPlanName: PLAN_LABELS[before.plan_type as PlanType],
      newPlanName: PLAN_LABELS[newPlan],
      scheduledDate: formatDate(after.scheduledAt),
    });
    return;
  }

  // (c) Cancel reservation appeared
  if (!before.cancel_at_period_end && after.cancelAtPeriodEnd) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "cancel-reserved",
      endDate: formatDate(after.currentPeriodEnd),
    });
    return;
  }

  // (d-1) Downgrade reservation removed (schedule_id non-null → null)
  if (before.schedule_id != null && after.scheduleId == null) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "reservation-removed-downgrade",
      planName: PLAN_LABELS[before.plan_type as PlanType],
    });
    return;
  }

  // (d-2) Cancel reservation removed (cancel_at_period_end true → false)
  if (before.cancel_at_period_end && !after.cancelAtPeriodEnd) {
    await sendChangedEmail(admin, send, before.user_id, {
      eventType: "reservation-removed-cancel",
      planName: PLAN_LABELS[before.plan_type as PlanType],
    });
    return;
  }

  // No diff worth notifying
}

interface ChangedEmailParams {
  eventType: SubscriptionChangedEventType;
  oldPlanName?: string;
  newPlanName?: string;
  planName?: string;
  scheduledDate?: string;
  endDate?: string;
}

async function sendChangedEmail(
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

async function sendCancelledEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  planType: PlanType,
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const tpl = subscriptionCancelledEmail({
      recipientName: recipient.name,
      planName: PLAN_LABELS[planType],
      cancelledAt: formatDate(new Date().toISOString()),
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleSubscriptionLifecycle] sendCancelledEmail failed",
      err,
    );
  }
}

async function sendPaymentFailedEmail(
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

async function sendOptionPaymentFailedEmail(
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

async function sendOptionCancelledEmail(
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

async function fetchRecipient(
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
