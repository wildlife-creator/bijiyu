/**
 * Edge Function: auto-cancel-past-due
 *
 * Called daily by pg_cron (03:00 JST = 18:00 UTC) via pg_net.
 *
 * Finds all subscriptions that have been past_due for more than 7 days and
 * cancels them on Stripe. The database update flows through the
 * customer.subscription.deleted webhook handler, which also triggers
 * compensation option chained cancellation (Gap 3).
 *
 * Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe";
import { Resend } from "npm:resend";

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

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resend = resendApiKey ? new Resend(resendApiKey) : null;

  const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://bijiyu.com";

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

      // Cancel on Stripe — DB update flows through customer.subscription.deleted webhook
      // which also handles compensation option chained cancellation
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);

      // Send cancellation email
      if (resend) {
        try {
          const { data: userRow } = await admin
            .from("users")
            .select("email, last_name, first_name")
            .eq("id", sub.user_id)
            .single();

          if (userRow?.email) {
            const name = `${userRow.last_name ?? ""}${userRow.first_name ?? ""}` || "お客様";
            const planLabels: Record<string, string> = {
              individual: "個人発注者様向けプラン",
              small: "小規模事業主様向けプラン",
              corporate: "法人向けプラン",
              corporate_premium: "法人向けプラン（高サポート）",
            };
            const planName = planLabels[sub.plan_type] ?? sub.plan_type;
            const now = new Date();
            const cancelledAt = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;

            await resend.emails.send({
              from: `ビジ友 <${Deno.env.get("EMAIL_FROM") || "noreply@bijiyu.com"}>`,
              to: userRow.email,
              subject: "【ビジ友】解約が完了しました",
              html: buildCancelledEmailHtml(name, planName, cancelledAt, appUrl),
            });
          }
        } catch (emailErr) {
          console.error("[auto-cancel-past-due] email send failed for user", sub.user_id, emailErr);
          // Email failure does not count as overall failure
        }
      }

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

// ---------------------------------------------------------------------------
// Inline email template (same design as subscriptionCancelledEmail in Next.js)
// ---------------------------------------------------------------------------

function buildCancelledEmailHtml(
  recipientName: string,
  planName: string,
  cancelledAt: string,
  serviceUrl: string,
): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Zen Kaku Gothic New',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
    <tr>
      <td style="padding:24px;text-align:center;background:#920783;">
        <span style="color:#ffffff;font-size:20px;font-weight:bold;">ビジ友</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 24px;">
        <p style="margin:0 0 16px;font-size:14px;color:#1e1e1e;">${recipientName} 様</p>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          お支払いの確認が取れなかったため、以下のプランが自動解約されました。
        </p>
        <table width="100%" style="background:#f4f4f4;border-radius:8px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">解約したプラン</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;font-weight:bold;color:#1e1e1e;">${planName}</td></tr>
          <tr><td style="padding:8px 16px;font-size:13px;color:#666;">解約日</td></tr>
          <tr><td style="padding:0 16px 8px;font-size:15px;color:#1e1e1e;">${cancelledAt}</td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#1e1e1e;">
          再度ご登録いただける際は、いつでも以下のページからお手続きいただけます。
        </p>
        <p style="text-align:center;">
          <a href="${serviceUrl}/billing" style="display:inline-block;padding:12px 32px;background:#920783;color:#ffffff;text-decoration:none;border-radius:47px;font-weight:bold;">プラン案内へ</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;text-align:center;background:#f4f4f4;font-size:12px;color:#9e9e9e;">
        <p style="margin:0 0 8px;">このメールはビジ友からの自動送信です。</p>
        <p style="margin:0;"><a href="${serviceUrl}" style="color:#601986;">ビジ友</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
