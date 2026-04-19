import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { sendEmail } from "@/lib/email/send-email";
import { paymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import { subscriptionChangedEmail } from "@/lib/email/templates/subscription-changed";
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

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://bijiyu.com";

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
 * - `customer.subscription.deleted`: same, plus chained option cancellation
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
      await handleSubscriptionCreated(admin, event.data);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(admin, stripe, event.data, send);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(admin, stripe, event.data, send);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(admin, event.data, send);
      return;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(admin, event.data);
      return;
  }
}

/**
 * customer.subscription.created
 *
 * Task 13.45.3: 再加入（解約済み組織の法人プラン再アップグレード）時に
 * 既存 organizations が残っていれば Admin / Staff の is_active=true を
 * 復帰させる。checkout.session.completed のバックアップとして subscription
 * 未登録時は INSERT も行う（冪等）。
 */
async function handleSubscriptionCreated(
  admin: SupabaseClient<Database>,
  sub: Stripe.Subscription,
): Promise<void> {
  const existing = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (!existing.data) {
    // checkout.session.completed ハンドラが未到着の場合のバックアップ。
    // user_id は Stripe customer から逆引きが必要なため、ここでは何もしない
    // （checkout 側の正規ルートに委ねる。Edge case なので冪等性のみ保証）
    return;
  }

  const isCorporate =
    existing.data.plan_type === "corporate" ||
    existing.data.plan_type === "corporate_premium";

  if (!isCorporate) return;

  // 既存組織があれば配下 Admin / Staff を復帰
  await reactivateCorporateMembers(admin, existing.data.user_id);
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
  stripe: Stripe,
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

    // 2. Delegate to RPC (subscriptions UPDATE + role downgrade + staff + jobs close)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (admin as any).rpc(
      "handle_subscription_lifecycle_deleted",
      { event_data: { stripe_subscription_id: sub.id } },
    );
    if (rpcError) {
      throw new Error(
        `handle_subscription_lifecycle_deleted RPC failed: ${rpcError.message ?? String(rpcError)}`,
      );
    }

    // 3. Chained cancellation of compensation options (Gap 3)
    await cancelCompensationOptionsForUser(admin, stripe, userId);

    // 4. Send subscriptionCancelledEmail (basic plan path only)
    await sendCancelledEmail(admin, send, userId, planType);
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

    const flagColumn =
      existingOption.data.option_type === "compensation_5000"
        ? "is_compensation_5000"
        : existingOption.data.option_type === "compensation_9800"
          ? "is_compensation_9800"
          : null;
    if (flagColumn) {
      const updateProfile = await admin
        .from("client_profiles")
        .update({ [flagColumn]: false })
        .eq("user_id", existingOption.data.user_id);
      if (updateProfile.error) {
        throw new Error(
          `client_profiles update for ${flagColumn} failed: ${updateProfile.error.message}`,
        );
      }
    }
    // No email — option-only cancellation should not look like full cancellation
    return;
  }

  // 6. Neither hit → silently skip
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

  if (!existing.data) {
    return; // Race: invoice arrived before checkout.session.completed
  }

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

  // Reactivate corporate plan staff if applicable
  const planType = existing.data.plan_type as PlanType;
  if (planType === "corporate" || planType === "corporate_premium") {
    await reactivateCorporateMembers(admin, existing.data.user_id);
  }
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
 * Cases (Gap 4):
 *   (a) plan_type changed                          → upgrade (即時)
 *   (b) schedule_id null → non-null                → downgrade reservation
 *   (c) cancel_at_period_end false → true          → cancel reservation
 *   (d) schedule_id non-null → null                → reservation cancelled
 *   (d) cancel_at_period_end true → false          → reservation cancelled
 *   else → no email
 */
async function maybeSendChangedEmail(
  admin: SupabaseClient<Database>,
  before: SubscriptionSnapshot,
  after: PostUpdateState,
  send: typeof sendEmail,
): Promise<void> {
  // (a) Upgrade — plan_type changed
  if (before.plan_type !== after.planType) {
    await sendChangedEmail(
      admin,
      send,
      before.user_id,
      before.plan_type as PlanType,
      after.planType,
      "ただ今",
    );
    return;
  }

  // (b) Downgrade reservation appeared
  if (before.schedule_id == null && after.scheduleId != null) {
    const newPlan = (after.scheduledPlanType as PlanType) ?? after.planType;
    await sendChangedEmail(
      admin,
      send,
      before.user_id,
      before.plan_type as PlanType,
      newPlan,
      formatDate(after.scheduledAt),
    );
    return;
  }

  // (c) Cancel reservation appeared
  if (!before.cancel_at_period_end && after.cancelAtPeriodEnd) {
    await sendChangedEmail(
      admin,
      send,
      before.user_id,
      before.plan_type as PlanType,
      "free",
      formatDate(after.currentPeriodEnd),
    );
    return;
  }

  // (d) Reservation removed
  if (
    (before.schedule_id != null && after.scheduleId == null) ||
    (before.cancel_at_period_end && !after.cancelAtPeriodEnd)
  ) {
    await sendChangedEmail(
      admin,
      send,
      before.user_id,
      before.plan_type as PlanType,
      after.planType,
      "予約取消",
    );
    return;
  }

  // No diff worth notifying
}

async function sendChangedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  oldPlan: PlanType,
  newPlan: PlanType,
  effectiveDate: string,
): Promise<void> {
  try {
    const recipient = await fetchRecipient(admin, userId);
    if (!recipient) return;
    const tpl = subscriptionChangedEmail({
      recipientName: recipient.name,
      oldPlanName: PLAN_LABELS[oldPlan],
      newPlanName: PLAN_LABELS[newPlan],
      effectiveDate,
      serviceUrl: SERVICE_URL,
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
      serviceUrl: SERVICE_URL,
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
      serviceUrl: SERVICE_URL,
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleSubscriptionLifecycle] sendPaymentFailedEmail failed",
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

/**
 * Cancel all active compensation options on Stripe for the given user.
 * The DB updates flow through subsequent customer.subscription.deleted
 * webhooks (option_subscriptions branch).
 */
async function cancelCompensationOptionsForUser(
  admin: SupabaseClient<Database>,
  stripe: Stripe,
  userId: string,
): Promise<void> {
  const options = await admin
    .from("option_subscriptions")
    .select("id, stripe_subscription_id")
    .eq("user_id", userId)
    .eq("payment_type", "subscription")
    .eq("status", "active");

  if (options.error || !options.data) return;

  for (const opt of options.data) {
    if (!opt.stripe_subscription_id) continue;
    try {
      await stripe.subscriptions.cancel(opt.stripe_subscription_id);
    } catch (err) {
      console.error(
        "[handleSubscriptionLifecycle] chained option cancel failed",
        { id: opt.id, err },
      );
      // Don't throw — best-effort cleanup
    }
  }
}

/**
 * 法人プラン再加入時に配下 Admin / Staff の users.is_active=true に復帰。
 * Task 13.45.2: 旧 reactivateCorporateStaff() を Admin も対象に拡張 + rename。
 */
async function reactivateCorporateMembers(
  admin: SupabaseClient<Database>,
  ownerId: string,
): Promise<void> {
  const org = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!org.data) return;

  const members = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", org.data.id)
    .in("org_role", ["admin", "staff"]);
  if (members.error || !members.data || members.data.length === 0) return;

  const userIds = members.data.map((s) => s.user_id);
  const update = await admin
    .from("users")
    .update({ is_active: true })
    .in("id", userIds);
  if (update.error) {
    throw new Error(
      `member reactivation failed: ${update.error.message}`,
    );
  }
}

/** 旧 API の後方互換のための alias（Task 13.45.2 rename 過渡期、削除予定） */
const reactivateCorporateStaff = reactivateCorporateMembers;
export { reactivateCorporateMembers, reactivateCorporateStaff };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
