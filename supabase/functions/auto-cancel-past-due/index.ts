/**
 * Edge Function: auto-cancel-past-due
 *
 * Called daily by pg_cron (03:00 JST = 18:00 UTC) via pg_net.
 *
 * Finds all subscriptions that have been past_due for more than 7 days and
 * cancels them on Stripe. **メール通知は本 Function では送らない** —
 * `customer.subscription.deleted` webhook 経由で
 * `handleSubscriptionDeleted` が `past_due_since` を見て `reason: 'auto-past-due'`
 * で `subscriptionCancelledEmail` を送る (§6.4 案 4、二重送信解消)。
 *
 * Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ---- Auth check ----
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[auto-cancel-past-due] unauthorized request");
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders,
    });
  }

  // ---- Clients ----
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-02-25.clover" });

  // ---- Find overdue subscriptions ----
  const { data: overdue, error: queryError } = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, stripe_subscription_id, past_due_since")
    .eq("status", "past_due")
    .not("past_due_since", "is", null)
    .lt("past_due_since", new Date(Date.now() - 7 * 86_400_000).toISOString());

  if (queryError) {
    console.error("[auto-cancel-past-due] query error", queryError);
    return Response.json(
      { total: 0, succeeded: 0, failed: 0, errors: [{ message: queryError.message }] },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!overdue || overdue.length === 0) {
    console.log("[auto-cancel-past-due] no overdue subscriptions found");
    return Response.json(
      { total: 0, succeeded: 0, failed: 0, errors: [] },
      { headers: corsHeaders },
    );
  }

  console.log(`[auto-cancel-past-due] processing ${overdue.length} overdue subscriptions`);

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ userId: string; message: string }> = [];

  for (const sub of overdue) {
    try {
      if (!sub.stripe_subscription_id) {
        throw new Error("missing stripe_subscription_id");
      }

      // Cancel on Stripe — DB update + メール送信は customer.subscription.deleted
      // webhook 経由で `handleSubscriptionDeleted` が担当 (§6.4 案 4)。
      // ここではメール送らない (二重送信防止)。
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);

      // Audit log
      await admin.from("audit_logs").insert({
        actor_id: null,
        action: "auto_cancelled_past_due",
        target_type: "subscription",
        target_id: sub.id,
        metadata: {
          user_id: sub.user_id,
          stripe_subscription_id: sub.stripe_subscription_id,
          past_due_since: sub.past_due_since,
        },
      });

      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auto-cancel-past-due] failed for user", sub.user_id, message);
      errors.push({ userId: sub.user_id, message });
      failed += 1;
    }
  }

  console.log(`[auto-cancel-past-due] done: total=${overdue.length} succeeded=${succeeded} failed=${failed}`);

  return Response.json(
    { total: overdue.length, succeeded, failed, errors },
    { headers: corsHeaders },
  );
});
