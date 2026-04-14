import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export interface WithWebhookIdempotencyResult {
  /** True when the handler was skipped (already completed, in progress, or stuck). */
  skipped: boolean;
  /** Reason the handler was skipped, for logging only. */
  skippedReason?:
    | "already_completed"
    | "stuck_processing"
    | "concurrent_insert"
    | "handler_failed";
}

/**
 * Webhook idempotency guard backed by `stripe_webhook_events`.
 *
 * Behaviour (matches design.md `withWebhookIdempotency`):
 *
 *  1. SELECT the `stripe_event_id`.
 *     - If the row already has `status='completed'` → skip (return `skipped: true`).
 *     - If the row has `status='processing'` → assume parallel or stuck handler,
 *       skip without retrying (Phase 1: do not auto-recover stuck rows).
 *     - If no row exists → INSERT one with `status='processing'`.
 *       - On UNIQUE violation (parallel INSERT lost the race) → skip.
 *  2. Run the supplied callback (the actual event handler).
 *  3. On success → UPDATE the row to `status='completed'` + `processed_at=NOW()`.
 *  4. On failure → UPDATE to `status='failed'` + `error_message`. Caller MUST
 *     still return 200 to Stripe so it does not retry. Phase 1: humans Resend
 *     manually from the dashboard.
 *
 * Always returns 200-equivalent state to the caller (the route handler should
 * respond `{ received: true }` regardless), so Stripe never retries on its own.
 *
 * @param admin   Supabase client constructed with the service_role key.
 * @param event   The Stripe event (only `id` and `type` are read).
 * @param handler Async callback that performs the actual work for this event.
 *                Should throw on failure so we can record `status='failed'`.
 */
export async function withWebhookIdempotency(
  admin: SupabaseClient<Database>,
  event: { id: string; type: string },
  handler: () => Promise<void>,
): Promise<WithWebhookIdempotencyResult> {
  // 1. Look up the event
  const existing = await admin
    .from("stripe_webhook_events")
    .select("status")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing.data?.status === "completed") {
    return { skipped: true, skippedReason: "already_completed" };
  }

  if (existing.data?.status === "processing") {
    // Parallel handler or stuck processing — skip without auto-recovery
    return { skipped: true, skippedReason: "stuck_processing" };
  }

  // 2. INSERT a new processing row (or skip on UNIQUE collision)
  if (!existing.data) {
    const insert = await admin.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      status: "processing",
    });

    if (insert.error) {
      // Most likely a UNIQUE violation from a parallel INSERT
      return { skipped: true, skippedReason: "concurrent_insert" };
    }
  } else if (existing.data.status === "failed") {
    // A previous attempt failed; flip it back to processing for the retry
    const reset = await admin
      .from("stripe_webhook_events")
      .update({ status: "processing", error_message: null })
      .eq("stripe_event_id", event.id);
    if (reset.error) {
      return { skipped: true, skippedReason: "concurrent_insert" };
    }
  }

  // 3. Run the actual handler
  try {
    await handler();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("stripe_webhook_events")
      .update({
        status: "failed",
        error_message: message.slice(0, 1000),
      })
      .eq("stripe_event_id", event.id);
    return { skipped: false, skippedReason: "handler_failed" };
  }

  // 4. Mark completed
  await admin
    .from("stripe_webhook_events")
    .update({
      status: "completed",
      processed_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", event.id);

  return { skipped: false };
}
