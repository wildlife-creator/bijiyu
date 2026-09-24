/**
 * 契約ライフサイクル Webhook が Stripe のオブジェクトから値を取り出すための純粋な補助関数。
 */

import type Stripe from "stripe";
import {
  type OptionCancellationReason,
} from "@/lib/email/templates/option-subscription-cancelled";
import {
  resolvePlanPriceFromId,
  type BillingCycle,
  type PaidPlanType,
} from "@/lib/constants/plans";

export function resolveOptionCancellationReason(
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

export function extractPlanPrice(
  sub: Stripe.Subscription,
): { planType: PaidPlanType; billingCycle: BillingCycle } | null {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  return resolvePlanPriceFromId(priceId);
}

export function extractScheduleId(sub: Stripe.Subscription): string | null {
  const value = sub.schedule;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function extractInvoiceSubscriptionId(
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
 * price ID to a plan_type using the env-driven reverse map.
 *
 * `kind` tells the caller how to treat the schedule:
 * - "none":    no schedule attached
 * - "next":    a future phase exists (= reservation pending) → scheduled_* resolved
 * - "pending": schedule attached but the future phase is not written yet.
 *              scheduleDowngradeAction creates the schedule and then adds the
 *              target phase in a second API call; the `customer.subscription.updated`
 *              from the first call can be processed in between. Caller must keep the
 *              existing DB values instead of overwriting them with NULL.
 * - "applied": the current phase is the last one (= the reservation has been
 *              applied at period end). Caller should clear the reservation and
 *              release the schedule so the UI stops showing 「変更予定」.
 */
export type ScheduleNextPhase = {
  kind: "none" | "next" | "pending" | "applied";
  scheduleId: string | null;
  scheduledPlanType: string | null;
  scheduledBillingCycle: BillingCycle | null;
  scheduledAt: string | null;
};

export async function resolveScheduleNextPhase(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<ScheduleNextPhase> {
  const empty = { scheduledPlanType: null, scheduledBillingCycle: null, scheduledAt: null };
  const scheduleId = extractScheduleId(sub);
  if (!scheduleId) return { kind: "none", scheduleId: null, ...empty };

  let schedule: Stripe.SubscriptionSchedule;
  try {
    schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  } catch {
    // 取得失敗時は既存の DB 値を触らない（pending と同じ扱い）
    return { kind: "pending", scheduleId, ...empty };
  }

  const phases = schedule.phases ?? [];
  const currentStart = schedule.current_phase?.start_date;
  let currentIndex =
    currentStart != null ? phases.findIndex((p) => p.start_date === currentStart) : 0;
  if (currentIndex < 0) currentIndex = 0;
  const nextPhase = phases[currentIndex + 1];
  if (!nextPhase) {
    const applied = phases.length >= 2 && currentIndex === phases.length - 1;
    return { kind: applied ? "applied" : "pending", scheduleId, ...empty };
  }

  const priceField = nextPhase.items?.[0]?.price;
  const priceId =
    typeof priceField === "string" ? priceField : (priceField?.id ?? null);
  if (!priceId) return { kind: "pending", scheduleId, ...empty };

  const planPrice = resolvePlanPriceFromId(priceId);
  if (!planPrice) {
    throw new Error(`unknown price id: ${priceId}`);
  }

  const startDate = nextPhase.start_date
    ? new Date(nextPhase.start_date * 1000).toISOString()
    : null;
  return {
    kind: "next",
    scheduleId,
    scheduledPlanType: planPrice.planType,
    scheduledBillingCycle: planPrice.billingCycle,
    scheduledAt: startDate,
  };
}
