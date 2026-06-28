import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { headers } from "next/headers";

import { OPTION_LABELS } from "@/lib/billing/options";
import { PLAN_LABELS, type PlanType } from "@/lib/constants/plans";
import { resolveApplicantCompanyName } from "@/lib/email/recipients/applicant-company-name";
import {
  fetchBillingRecipient,
  formatBillingDate,
  formatBillingDateTime,
} from "@/lib/email/recipients/billing-recipient";
import {
  getJobClientRecipients,
  getUserOrganizationRecipients,
} from "@/lib/email/recipients/organization-members";
import { sendEmail } from "@/lib/email/send-email";
import { optionSubscriptionActivatedEmail } from "@/lib/email/templates/option-subscription-activated";
import { planActivatedEmail } from "@/lib/email/templates/plan-activated";
import { urgentOptionActivatedEmail } from "@/lib/email/templates/urgent-option-activated";
import { videoOptionActivatedEmail } from "@/lib/email/templates/video-option-activated";
import { videoOptionAppliedOpsEmail } from "@/lib/email/templates/video-option-applied-ops";
import type { Database } from "@/types/database";

/**
 * Test-only DI seam mirroring `LifecycleDeps` in handle-subscription-lifecycle.ts.
 * 通常コードパスは sendEmail を直接使う。
 */
export interface CheckoutDeps {
  sendEmail?: typeof sendEmail;
}

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
  deps: CheckoutDeps = {},
): Promise<void> {
  const metadata = session.metadata ?? {};
  const type = metadata.type;
  const send = deps.sendEmail ?? sendEmail;

  if (type === "plan") {
    await handlePlanCheckout(admin, session, send);
    return;
  }

  if (type === "option") {
    await handleOptionCheckout(admin, session, send);
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
  send: typeof sendEmail,
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

  // 管理者招待フロー（ADM-006/007）: user_metadata に invited_company_name が
  // ある場合、RPC 呼び出しの「前」に client_profiles へ会社名を upsert する。
  // RPC `handle_checkout_completed_plan` は display_name を担当者の姓名で
  // 必ず埋める（INSERT ... ON CONFLICT DO NOTHING）ため、「RPC 後に未設定なら
  // 反映」では成立しない。先に会社名で行を作っておけば RPC の
  // ON CONFLICT DO NOTHING が会社名を維持する。
  // ignoreDuplicates のため Webhook 再実行・本人が CLI-021 で編集済みでも
  // 上書きしない（冪等）。失敗しても通常の決済処理はブロックしない。
  try {
    const { data: invitedUser } = await admin.auth.admin.getUserById(userId);
    const invitedCompanyName =
      invitedUser?.user?.user_metadata?.invited_company_name;
    if (
      typeof invitedCompanyName === "string" &&
      invitedCompanyName.trim() !== ""
    ) {
      const { error: upsertError } = await admin
        .from("client_profiles")
        .upsert(
          { user_id: userId, display_name: invitedCompanyName },
          { onConflict: "user_id", ignoreDuplicates: true },
        );
      if (upsertError) {
        console.error(
          "[handlePlanCheckout] invited company name upsert failed (non-blocking)",
          upsertError,
        );
      }
    }
  } catch (err) {
    console.error(
      "[handlePlanCheckout] invited company name reflection failed (non-blocking)",
      err,
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

  // Phase 5 (proxy-account-multi-org-support) で reactivateCorporateMembers を撤廃。
  // 法人プラン再アップグレード時の配下 Admin/Staff 復帰は organization_members 行
  // 削除モデルに移行したため、checkout.session.completed では何も追加処理しない。

  // §6.7 基本プラン契約完了メール (初回契約 / 解約後の再契約両方をカバー、Owner 1 名のみ)。
  // 失敗はサイレント (DB 整合は RPC で完了済み)。
  await sendPlanActivatedEmail(admin, send, userId, planType as PlanType);
}

async function sendPlanActivatedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  planType: PlanType,
): Promise<void> {
  try {
    const recipient = await fetchBillingRecipient(admin, userId);
    if (!recipient) return;
    const tpl = planActivatedEmail({
      recipientName: recipient.name,
      planName: PLAN_LABELS[planType],
      activatedAt: formatBillingDate(new Date().toISOString()),
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[handlePlanCheckout] sendPlanActivatedEmail failed", err);
  }
}

// ---------------------------------------------------------------------------
// Option branch (compensation / urgent / video)
// ---------------------------------------------------------------------------

async function handleOptionCheckout(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  send: typeof sendEmail,
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
    await handleCompensationOption(admin, session, userId, optionType, send);
    return;
  }

  if (optionType === "urgent") {
    await handleUrgentOption(admin, session, userId, metadata.job_id, send);
    return;
  }

  if (optionType === "video") {
    await handleVideoOption(admin, session, userId, send);
    return;
  }

  if (optionType === "video_workplace") {
    await handleVideoWorkplaceOption(admin, session, userId, send);
    return;
  }

  throw new Error(`handleOptionCheckout: unknown option_type='${optionType}'`);
}

async function handleCompensationOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
  optionType: "compensation_5000" | "compensation_9800",
  send: typeof sendEmail,
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

  // 補償オプションは受注者向け給与未払い保険として contractor / client(owner)
  // 全ユーザーが購入対象。active 判定の Single Source of Truth は
  // option_subscriptions に一本化済みのため、client_profiles 側のフラグ
  // 更新は不要（カラム自体が廃止）。
  const insert = await admin
    .from("option_subscriptions")
    .insert({
      user_id: userId,
      payment_type: "subscription",
      stripe_subscription_id: subscriptionId,
      option_type: optionType,
      status: "active",
    })
    .select("created_at")
    .single();
  if (insert.error) {
    throw new Error(`option_subscriptions insert failed: ${insert.error.message}`);
  }

  // §6.5.A 補償オプション申し込み完了メール（申込者本人 1 通、fire-and-forget）。
  await sendCompensationActivatedEmail(
    admin,
    send,
    userId,
    optionType,
    insert.data?.created_at ?? new Date().toISOString(),
  );
}

async function sendCompensationActivatedEmail(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  optionType: "compensation_5000" | "compensation_9800",
  activatedAtIso: string,
): Promise<void> {
  try {
    const recipient = await fetchBillingRecipient(admin, userId);
    if (!recipient) return;
    const tpl = optionSubscriptionActivatedEmail({
      recipientName: recipient.name,
      optionLabel: OPTION_LABELS[optionType],
      activatedAt: formatBillingDate(activatedAtIso),
    });
    await send({ to: recipient.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error(
      "[handleCheckoutCompleted] sendCompensationActivatedEmail failed",
      err,
    );
  }
}

async function handleUrgentOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
  jobId: string | undefined,
  send: typeof sendEmail,
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

  // §6.6.A 急募オプション申し込み完了 (M-03 broadcast、jobs 起点で配信先解決)。
  // 失敗はサイレント (DB 整合は完了している)。
  await sendUrgentActivatedEmails(admin, send, jobId, sevenDaysLater);
}

async function sendUrgentActivatedEmails(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  jobId: string,
  endDate: Date,
): Promise<void> {
  try {
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select("title, owner_id, organization_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) return;

    const recipients = await getJobClientRecipients(admin, {
      owner_id: job.owner_id as string,
      organization_id: (job.organization_id as string | null) ?? null,
    });
    if (recipients.length === 0) return;

    const tpl = (recipientName: string) =>
      urgentOptionActivatedEmail({
        recipientName,
        jobTitle: (job.title as string) ?? "",
        endDate: formatBillingDate(endDate.toISOString()),
      });

    await Promise.all(
      recipients.map(async (r) => {
        const built = tpl(r.displayName);
        try {
          await send({ to: r.email, subject: built.subject, html: built.html });
        } catch (err) {
          console.error(
            "[handleUrgentOption] §6.6.A send failed",
            { to: r.email, err },
          );
        }
      }),
    );
  } catch (err) {
    console.error("[handleUrgentOption] sendUrgentActivatedEmails failed", err);
  }
}

async function handleVideoOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
  send: typeof sendEmail,
): Promise<void> {
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  if (!paymentIntentId) {
    throw new Error(
      `handleVideoOption: session ${session.id} has no payment_intent`,
    );
  }

  const insert = await admin
    .from("option_subscriptions")
    .insert({
      user_id: userId,
      payment_type: "one_time",
      stripe_payment_intent_id: paymentIntentId,
      option_type: "video",
      status: "active",
      end_date: null,
    })
    .select("created_at")
    .single();
  if (insert.error) {
    throw new Error(
      `video option_subscriptions insert failed: ${insert.error.message}`,
    );
  }

  await sendVideoActivatedEmails(
    admin,
    send,
    userId,
    "video",
    insert.data?.created_at ?? new Date().toISOString(),
  );
}

async function handleVideoWorkplaceOption(
  admin: SupabaseClient<Database>,
  session: Stripe.Checkout.Session,
  userId: string,
  send: typeof sendEmail,
): Promise<void> {
  // 職場紹介動画掲載（video-display Task 4.2）。
  // 既存 handleVideoOption と同パターン（option_type のみ差し替え）。
  // 冪等性は webhook の event dedupe（stripe_webhook_events）に委ねる。
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  if (!paymentIntentId) {
    throw new Error(
      `handleVideoWorkplaceOption: session ${session.id} has no payment_intent`,
    );
  }

  const insert = await admin
    .from("option_subscriptions")
    .insert({
      user_id: userId,
      payment_type: "one_time",
      stripe_payment_intent_id: paymentIntentId,
      option_type: "video_workplace",
      status: "active",
      end_date: null,
    })
    .select("created_at")
    .single();
  if (insert.error) {
    throw new Error(
      `video_workplace option_subscriptions insert failed: ${insert.error.message}`,
    );
  }

  await sendVideoActivatedEmails(
    admin,
    send,
    userId,
    "video_workplace",
    insert.data?.created_at ?? new Date().toISOString(),
  );
}

/**
 * §6.6.B-User + §6.6.B-Ops 並列送信ヘルパー (動画 / 職場紹介動画共通)。
 *
 * - B-User: 申込者本人 + 法人プランなら組織メンバー全員 (M-03 broadcast)
 * - B-Ops: `process.env.OPS_NOTIFICATION_EMAIL` 単一宛先 (M-07)
 *
 * 失敗はサイレント (片方失敗でも他方は送信)。
 */
async function sendVideoActivatedEmails(
  admin: SupabaseClient<Database>,
  send: typeof sendEmail,
  userId: string,
  optionType: "video" | "video_workplace",
  activatedAtIso: string,
): Promise<void> {
  const optionLabel = OPTION_LABELS[optionType];

  // B-User broadcast
  try {
    const recipients = await getUserOrganizationRecipients(admin, userId);
    await Promise.all(
      recipients.map(async (r) => {
        const built = videoOptionActivatedEmail({
          recipientName: r.displayName,
          optionLabel,
          activatedAt: formatBillingDate(activatedAtIso),
        });
        try {
          await send({ to: r.email, subject: built.subject, html: built.html });
        } catch (err) {
          console.error("[handleVideoOption] §6.6.B-User send failed", {
            to: r.email,
            err,
          });
        }
      }),
    );
  } catch (err) {
    console.error("[handleVideoOption] §6.6.B-User broadcast failed", err);
  }

  // B-Ops single
  try {
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
    if (!opsEmail) return;

    const { data: applicant } = await admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", userId)
      .maybeSingle();
    const applicantName =
      `${applicant?.last_name ?? ""}${applicant?.first_name ?? ""}`.trim() ||
      "申込者";
    const companyName = await resolveApplicantCompanyName(admin, userId);

    const hdrs = await headers();
    const host = hdrs.get("host");
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const siteUrl = host
      ? `${proto}://${host}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");

    const tpl = videoOptionAppliedOpsEmail({
      applicantName,
      companyName,
      appliedAt: formatBillingDateTime(activatedAtIso),
      optionLabel,
      userId,
      siteUrl,
    });
    await send({ to: opsEmail, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[handleVideoOption] §6.6.B-Ops send failed", err);
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
