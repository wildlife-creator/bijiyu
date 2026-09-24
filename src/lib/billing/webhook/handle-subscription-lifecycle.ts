import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { sendEmail } from "@/lib/email/send-email";
import { type OptionType } from "@/lib/billing/options";
import { extractPeriodEnd, extractPeriodStart } from "@/lib/billing/subscription-periods";
import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";
import { type BillingCycle, type PlanType } from "@/lib/constants/plans";
import type { Database } from "@/types/database";
import {
  maybeSendChangedEmail,
  sendCancelledEmail,
  sendPaymentFailedEmail,
  sendOptionPaymentFailedEmail,
  sendOptionCancelledEmail,
} from "./lifecycle-emails";
import {
  resolveOptionCancellationReason,
  extractPlanPrice,
  extractInvoiceSubscriptionId,
  resolveScheduleNextPhase,
} from "./lifecycle-stripe";

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
export interface SubscriptionSnapshot {
  id: string;
  user_id: string;
  plan_type: string;
  /** 支払サイクル。旧行は monthly */
  billing_cycle?: BillingCycle | null;
  /** cancelled の行は Stripe からの遅延通知で巻き戻さない（下記ガード参照） */
  status?: string | null;
  schedule_id: string | null;
  scheduled_plan_type?: string | null;
  scheduled_billing_cycle?: BillingCycle | null;
  scheduled_at?: string | null;
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
 *   報酬未払い保険) are independent contracts — no chained cancellation when
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
    .select(
      "id, user_id, plan_type, billing_cycle, status, schedule_id, scheduled_plan_type, scheduled_billing_cycle, scheduled_at, cancel_at_period_end",
    )
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existingSubscription.data) {
    const snapshot: SubscriptionSnapshot = existingSubscription.data;

    // 解約済みの行は巻き戻さない。cancelImmediatelyAction は cancel の直前に
    // metadata を書くため customer.subscription.updated(status=past_due) が
    // 発生し、それが customer.subscription.deleted より後に処理されると
    // cancelled → past_due に戻って「Stripe は解約済みなのに有料扱い」になる
    // （2026-09 支払い E2E TC-172 で実例）。Stripe の契約は解約後に復活しないので
    // cancelled の行への updated は常に無視してよい。
    if (snapshot.status === "cancelled") {
      return;
    }

    // 2. Build event_data from the live Stripe Subscription
    const newPlanPrice = extractPlanPrice(sub);
    if (!newPlanPrice) {
      throw new Error(
        `handleSubscriptionUpdated: unknown price id on subscription ${sub.id}`,
      );
    }
    const newPlanType = newPlanPrice.planType;

    const next = await resolveScheduleNextPhase(stripe, sub);
    // 予約（scheduled_*）の扱い。resolveScheduleNextPhase の kind 参照:
    // - next:    Stripe の次フェーズをそのまま採用
    // - pending: 予約作成の 2 回目の API 呼び出し前に届いた通知。scheduleDowngradeAction
    //            の先行 UPDATE を NULL で上書きしないよう既存の DB 値を維持
    // - applied: 期末に適用済み。予約を消し、Stripe 側のスケジュールも終了して
    //            料金画面の「変更予定」が残り続けないようにする（TC-167/168 の不具合）
    let scheduleId: string | null = next.scheduleId;
    let scheduledPlanType = next.scheduledPlanType;
    let scheduledBillingCycle = next.scheduledBillingCycle;
    let scheduledAt = next.scheduledAt;
    if (next.kind === "pending") {
      scheduledPlanType = snapshot.scheduled_plan_type ?? null;
      scheduledBillingCycle = snapshot.scheduled_billing_cycle ?? null;
      scheduledAt = snapshot.scheduled_at ?? null;
    } else if (next.kind === "applied") {
      scheduleId = null;
    }

    const eventData = {
      stripe_subscription_id: sub.id,
      plan_type: newPlanType,
      billing_cycle: newPlanPrice.billingCycle,
      status: sub.status,
      current_period_start: extractPeriodStart(sub),
      current_period_end: extractPeriodEnd(sub),
      schedule_id: scheduleId,
      scheduled_plan_type: scheduledPlanType,
      scheduled_billing_cycle: scheduledBillingCycle,
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

    // 3b. 適用済みのスケジュールは Stripe 側でも終了する（失敗しても DB は更新済み。
    //     release で届く次の updated は schedule なし・差分なしで何もしない）
    if (next.kind === "applied" && next.scheduleId) {
      try {
        await stripe.subscriptionSchedules.release(next.scheduleId);
      } catch (err) {
        console.error(
          "[handleSubscriptionUpdated] release applied schedule failed",
          { scheduleId: next.scheduleId, err },
        );
      }
    }

    // 4. Diff snapshot vs new state to decide which email to send
    await maybeSendChangedEmail(admin, snapshot, {
      planType: newPlanType,
      billingCycle: newPlanPrice.billingCycle,
      scheduleId: eventData.schedule_id,
      scheduledPlanType: scheduledPlanType,
      scheduledBillingCycle: scheduledBillingCycle,
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
  // 1. SELECT subscriptions (§6.4 reason 判定のため past_due_since も取得)
  const existingSubscription = await admin
    .from("subscriptions")
    .select("id, user_id, plan_type, past_due_since")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existingSubscription.data) {
    const userId = existingSubscription.data.user_id;
    const planType = existingSubscription.data.plan_type as PlanType;
    // §6.4: past_due_since が set されていれば 7 日経過自動解約 (Edge Function 経由)、
    // それ以外は手動解約。spec §6.4 確定済の reason 判定軸。
    // A8: 「即時解約（cancelImmediatelyAction）」は past_due 中しか実行できないため
    // past_due_since が常に non-null で誤って "auto-past-due" 判定になっていた。
    // Server Action 側で Stripe metadata に "manual_immediate" フラグを付けているので
    // ここで metadata を優先して判定する（設定なければ従来ロジックにフォールバック）。
    const isManualImmediate =
      sub.metadata?.bijiyu_cancel_source === "manual_immediate";
    const cancellationReason: "manual" | "auto-past-due" = isManualImmediate
      ? "manual"
      : existingSubscription.data.past_due_since != null
        ? "auto-past-due"
        : "manual";

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

    // 4. 補償オプション（受注者向け報酬未払い保険）は基本プランから独立した
    //    契約。基本プラン解約時の連鎖キャンセルは行わない（旧 Gap 3 ロジック
    //    廃止）。ユーザーが補償も停止したい場合は別途 cancelCompensationAction
    //    を呼ぶ。

    // 5. Send subscriptionCancelledEmail (basic plan path only)
    //    §6.5 退会 suppression: 退会済なら skip（E-8 退会通知に集約）。
    //    §6.4: cancellationReason で manual / auto-past-due を区別し、
    //    auto-past-due のときは opening 1 行プレフィックス付きで送信。
    if (!isWithdrawn) {
      await sendCancelledEmail(admin, send, userId, planType, cancellationReason);
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
    // urgent / 動画系は payment mode で本パスに来ない想定だが、
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
