import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { handleCheckoutCompleted } from "@/lib/billing/webhook/handle-checkout-completed";
import { handleSubscriptionLifecycle } from "@/lib/billing/webhook/handle-subscription-lifecycle";
import { withWebhookIdempotency } from "@/lib/billing/webhook/idempotency";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe Webhook endpoint.
 *
 * Runtime is forced to Node.js because the Stripe SDK uses
 * Node-specific crypto for signature verification (not available in
 * Edge Runtime).
 *
 * Always returns 200 unless signature verification fails — Stripe's
 * automatic retry policy is opted out by withWebhookIdempotency: failed
 * handler runs are recorded as `status='failed'` in stripe_webhook_events
 * and require manual Resend from the dashboard.
 */
export const runtime = "nodejs";

const SUPPORTED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    console.error("[stripe-webhook] missing stripe-signature header");
    return new NextResponse("missing signature", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }

  // Read the raw body BEFORE any parsing — required by Stripe signature verification.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    // Log the error internally but never expose details to the caller.
    console.error("[stripe-webhook] signature verification failed", err);
    return new NextResponse("invalid signature", { status: 400 });
  }

  // Unsupported event types are acknowledged with 200 and skipped before
  // touching the idempotency table — no row written.
  if (!SUPPORTED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true, skipped: "unsupported_event" });
  }

  const admin = createAdminClient();

  await withWebhookIdempotency(admin, event, async () => {
    const stripe = getStripeClient();
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          admin,
          event.data.object as Stripe.Checkout.Session,
        );
        return;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionLifecycle(admin, stripe, {
          type: event.type,
          data: event.data.object as Stripe.Subscription,
        });
        return;
      case "invoice.payment_failed":
      case "invoice.payment_succeeded":
        await handleSubscriptionLifecycle(admin, stripe, {
          type: event.type,
          data: event.data.object as Stripe.Invoice,
        });
        return;
    }
  });

  // Always 200 — withWebhookIdempotency has already persisted any failure state.
  return NextResponse.json({ received: true });
}
