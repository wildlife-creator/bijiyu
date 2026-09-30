/**
 * auto-cancel-past-due の本体（Deno / Node のどちらからも import できるよう、外部 import を持たない）。
 *
 * 支払い遅延（past_due）が 7 日を超えた Stripe 契約を解約する。
 * - 銀行振込（payment_method='bank_transfer'）は Stripe に契約が無く、運営の手動運用のため対象外
 * - DB の更新と解約メールは customer.subscription.deleted Webhook（handleSubscriptionDeleted）が行う。
 *   ここではメールを送らない（二重送信防止。§6.4 案 4）
 * - 1 件の失敗で他の契約の解約を止めない
 *
 * 単体テスト: src/__tests__/billing/auto-cancel-past-due.test.ts
 */

/** 支払い遅延からこの日数を超えたら解約する。 */
export const PAST_DUE_GRACE_DAYS = 7;

export interface OverdueSubscription {
  id: string;
  user_id: string;
  plan_type: string;
  stripe_subscription_id: string | null;
  past_due_since: string | null;
}

/** 使うのは subscriptions の検索と audit_logs への INSERT だけ（supabase-js の形に合わせる）。 */
export interface AutoCancelDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          not(column: string, operator: string, value: null): {
            lt(
              column: string,
              value: string,
            ): PromiseLike<{
              data: OverdueSubscription[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    insert(row: Record<string, unknown>): PromiseLike<unknown>;
  };
}

export interface AutoCancelStripe {
  subscriptions: { cancel(id: string): Promise<unknown> };
}

export interface AutoCancelResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ userId?: string; message: string }>;
  /** 検索自体が失敗したとき true（呼び出し側は 500 を返す） */
  queryFailed: boolean;
}

export async function processOverdueSubscriptions(params: {
  db: AutoCancelDb;
  stripe: AutoCancelStripe;
  now: Date;
  log?: (message: string, ...args: unknown[]) => void;
}): Promise<AutoCancelResult> {
  const { db, stripe, now } = params;
  const log = params.log ?? (() => {});
  const cutoff = new Date(
    now.getTime() - PAST_DUE_GRACE_DAYS * 86_400_000,
  ).toISOString();

  const { data: overdue, error: queryError } = await db
    .from("subscriptions")
    .select("id, user_id, plan_type, stripe_subscription_id, past_due_since")
    .eq("status", "past_due")
    .eq("payment_method", "stripe")
    .not("past_due_since", "is", null)
    .lt("past_due_since", cutoff);

  if (queryError) {
    log("[auto-cancel-past-due] query error", queryError);
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      errors: [{ message: queryError.message }],
      queryFailed: true,
    };
  }

  const rows = overdue ?? [];
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ userId?: string; message: string }> = [];

  for (const sub of rows) {
    try {
      if (!sub.stripe_subscription_id) {
        throw new Error("missing stripe_subscription_id");
      }
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      await db.from("audit_logs").insert({
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
      log("[auto-cancel-past-due] failed for user", sub.user_id, message);
      errors.push({ userId: sub.user_id, message });
      failed += 1;
    }
  }

  return { total: rows.length, succeeded, failed, errors, queryFailed: false };
}
