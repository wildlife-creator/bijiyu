import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { Database } from "@/types/database";

/**
 * Handle a Stripe `checkout.session.completed` event.
 *
 * Splits on `metadata.type`:
 *   - 'plan'   → defer to PL/pgSQL RPC `handle_checkout_completed_plan`
 *                (single transaction: subscriptions UPSERT + users.role +
 *                 client_profiles UPSERT + ensure_organization_exists +
 *                 audit_logs).
 *   - 'option' → handled in TypeScript via admin client
 *                (compensation / urgent / video).
 *
 * Throws on any error so `withWebhookIdempotency` records the event as failed.
 */
export async function handleCheckoutCompleted(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const type = metadata.type;

  if (type === "plan") {
    await handlePlanCheckout(admin, session);
    return;
  }

  if (type === "option") {
    await handleOptionCheckout(admin, session);
    return;
  }

  // Unknown / missing metadata.type — fail loudly so the webhook gets recorded
  // as failed and a human can investigate via the Stripe dashboard.
  throw new Error(
    `handleCheckoutCompleted: unknown metadata.type='${type ?? "(missing)"}' for session ${session.id}`,
  );
}

// ---------------------------------------------------------------------------
// Basic plan branch (delegates to RPC)
// ---------------------------------------------------------------------------

async function handlePlanCheckout(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const userId = metadata.user_id;
  const planType = metadata.plan_type;

  if (!userId || !planType) {
    throw new Error(
      `handlePlanCheckout: missing user_id or plan_type in session ${session.id} metadata`,
    );
  }

  const subscriptionId = extractSubscriptionId(session.subscription);
  const customerId = extractCustomerId(session.customer);

  if (!subscriptionId) {
    throw new Error(
      `handlePlanCheckout: session ${session.id} has no subscription id`,
    );
  }

  // The current_period_* values may not be present on the Checkout Session
  // itself. Caller (route handler) is responsible for fetching the
  // subscription if it needs them; for plan checkout the RPC will accept
  // null and fall back to defaults set by Stripe via subsequent
  // customer.subscription.updated events.
  const eventData = {
    user_id: userId,
    plan_type: planType,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    current_period_start: null,
    current_period_end: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).rpc("handle_checkout_completed_plan", {
    event_data: eventData,
  });

  if (error) {
    throw new Error(
      `handle_checkout_completed_plan RPC failed: ${error.message ?? String(error)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Option branch (compensation / urgent / video)
// ---------------------------------------------------------------------------

async function handleOptionCheckout(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const userId = metadata.user_id;
  const optionType = metadata.option_type;

  if (!userId || !optionType) {
    throw new Error(
      `handleOptionCheckout: missing user_id or option_type in session ${session.id} metadata`,
    );
  }

  if (optionType === "compensation_5000" || optionType === "compensation_9800") {
    await handleCompensationOption(admin, session, userId, optionType);
    return;
  }

  if (optionType === "urgent") {
    await handleUrgentOption(admin, session, userId, metadata.job_id);
    return;
  }

  if (optionType === "video") {
    await handleVideoOption(admin, session, userId);
    return;
  }

  throw new Error(`handleOptionCheckout: unknown option_type='${optionType}'`);
}

async function handleCompensationOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
  optionType: "compensation_5000" | "compensation_9800",
): Promise<void> {
  // 二重防御チェック: 既存 active な補償オプションがあれば fail
  const existing = await admin
    .from("option_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("option_type", ["compensation_5000", "compensation_9800"])
    .eq("status", "active")
    .limit(1);

  if (existing.data && existing.data.length > 0) {
    throw new Error(
      `duplicate compensation option detected for user_id=${userId}`,
    );
  }

  const subscriptionId = extractSubscriptionId(session.subscription);
  if (!subscriptionId) {
    throw new Error(
      `handleCompensationOption: session ${session.id} has no subscription id`,
    );
  }

  const insert = await admin.from("option_subscriptions").insert({
    user_id: userId,
    payment_type: "subscription",
    stripe_subscription_id: subscriptionId,
    option_type: optionType,
    status: "active",
  });
  if (insert.error) {
    throw new Error(`option_subscriptions insert failed: ${insert.error.message}`);
  }

  const flagColumn =
    optionType === "compensation_5000"
      ? "is_compensation_5000"
      : "is_compensation_9800";
  const updateProfile = await admin
    .from("client_profiles")
    .update({ [flagColumn]: true })
    .eq("user_id", userId);
  if (updateProfile.error) {
    throw new Error(
      `client_profiles update for ${flagColumn} failed: ${updateProfile.error.message}`,
    );
  }
}

async function handleUrgentOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
  jobId: string | undefined,
): Promise<void> {
  if (!jobId) {
    throw new Error(
      `handleUrgentOption: session ${session.id} metadata missing job_id`,
    );
  }
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  if (!paymentIntentId) {
    throw new Error(
      `handleUrgentOption: session ${session.id} has no payment_intent`,
    );
  }

  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const insert = await admin.from("option_subscriptions").insert({
    user_id: userId,
    job_id: jobId,
    payment_type: "one_time",
    stripe_payment_intent_id: paymentIntentId,
    option_type: "urgent",
    status: "active",
    start_date: now.toISOString(),
    end_date: sevenDaysLater.toISOString(),
  });
  if (insert.error) {
    throw new Error(
      `urgent option_subscriptions insert failed: ${insert.error.message}`,
    );
  }

  const updateProfile = await admin
    .from("client_profiles")
    .update({ is_urgent_option: true })
    .eq("user_id", userId);
  if (updateProfile.error) {
    throw new Error(
      `client_profiles update is_urgent_option failed: ${updateProfile.error.message}`,
    );
  }

  const updateJob = await admin
    .from("jobs")
    .update({ is_urgent: true })
    .eq("id", jobId);
  if (updateJob.error) {
    throw new Error(`jobs update is_urgent failed: ${updateJob.error.message}`);
  }
}

async function handleVideoOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
): Promise<void> {
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  if (!paymentIntentId) {
    throw new Error(
      `handleVideoOption: session ${session.id} has no payment_intent`,
    );
  }

  const insert = await admin.from("option_subscriptions").insert({
    user_id: userId,
    payment_type: "one_time",
    stripe_payment_intent_id: paymentIntentId,
    option_type: "video",
    status: "active",
    end_date: null,
  });
  if (insert.error) {
    throw new Error(
      `video option_subscriptions insert failed: ${insert.error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSubscriptionId(
  value: Stripe.Checkout.Session["subscription"],
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

function extractCustomerId(
  value: Stripe.Checkout.Session["customer"],
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if ("deleted" in value) return null;
  return value.id;
}

function extractPaymentIntentId(
  value: Stripe.Checkout.Session["payment_intent"],
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}
