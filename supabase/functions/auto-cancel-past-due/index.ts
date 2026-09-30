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

import { processOverdueSubscriptions, type AutoCancelDb } from "./process.ts";

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

  // ---- Find overdue subscriptions → cancel on Stripe（本体は process.ts）----
  const result = await processOverdueSubscriptions({
    // supabase-js のクライアントは AutoCancelDb の形を満たす（検索と audit_logs への INSERT のみ使う）
    db: admin as unknown as AutoCancelDb,
    stripe,
    now: new Date(),
    log: (message, ...args) => console.error(message, ...args),
  });

  if (result.queryFailed) {
    return Response.json(
      { total: 0, succeeded: 0, failed: 0, errors: result.errors },
      { status: 500, headers: corsHeaders },
    );
  }

  console.log(
    `[auto-cancel-past-due] done: total=${result.total} succeeded=${result.succeeded} failed=${result.failed}`,
  );

  return Response.json(
    {
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      errors: result.errors,
    },
    { headers: corsHeaders },
  );
});
