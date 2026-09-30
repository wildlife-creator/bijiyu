import { describe, expect, it, vi } from "vitest";

// Edge Function（supabase/functions）は @/ エイリアスの外にあるため相対パスで読む
import {
  PAST_DUE_GRACE_DAYS,
  processOverdueSubscriptions,
  type AutoCancelDb,
  type OverdueSubscription,
} from "../../../supabase/functions/auto-cancel-past-due/process";

/**
 * auto-cancel-past-due（毎日 3 時の自動解約）の本体のテスト。
 * supabase-js の問い合わせチェーンと Stripe をモックし、対象の選び方・解約・記録・失敗時の扱いを確認する。
 */

interface Recorded {
  filters: Array<[string, ...unknown[]]>;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
}

function makeDb(result: {
  data: OverdueSubscription[] | null;
  error: { message: string } | null;
}): { db: AutoCancelDb; rec: Recorded } {
  const rec: Recorded = { filters: [], inserts: [] };
  const db: AutoCancelDb = {
    from(table: string) {
      return {
        select(columns: string) {
          rec.filters.push(["select", table, columns]);
          return {
            eq(c1: string, v1: string) {
              rec.filters.push(["eq", c1, v1]);
              return {
                eq(c2: string, v2: string) {
                  rec.filters.push(["eq", c2, v2]);
                  return {
                    not(c3: string, op: string, v3: null) {
                      rec.filters.push(["not", c3, op, v3]);
                      return {
                        lt(c4: string, v4: string) {
                          rec.filters.push(["lt", c4, v4]);
                          return Promise.resolve(result);
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          rec.inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { db, rec };
}

const NOW = new Date("2026-10-01T18:00:00.000Z"); // 10/2 3:00 JST

function row(overrides: Partial<OverdueSubscription> = {}): OverdueSubscription {
  return {
    id: "sub-row-1",
    user_id: "user-1",
    plan_type: "individual",
    stripe_subscription_id: "sub_stripe_1",
    past_due_since: "2026-09-22T11:00:00.000Z",
    ...overrides,
  };
}

describe("processOverdueSubscriptions", () => {
  it("past_due・Stripe 払い・遅延開始が 7 日より前の契約だけを探す（銀行振込は対象外）", async () => {
    const { db, rec } = makeDb({ data: [], error: null });
    const stripe = { subscriptions: { cancel: vi.fn() } };

    await processOverdueSubscriptions({ db, stripe, now: NOW });

    expect(PAST_DUE_GRACE_DAYS).toBe(7);
    expect(rec.filters).toEqual([
      ["select", "subscriptions", "id, user_id, plan_type, stripe_subscription_id, past_due_since"],
      ["eq", "status", "past_due"],
      ["eq", "payment_method", "stripe"],
      ["not", "past_due_since", "is", null],
      ["lt", "past_due_since", "2026-09-24T18:00:00.000Z"],
    ]);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("対象の契約を Stripe で解約し、監査ログを残す（メールは送らない＝Webhook に任せる）", async () => {
    const { db, rec } = makeDb({
      data: [row(), row({ id: "sub-row-2", user_id: "user-2", stripe_subscription_id: "sub_stripe_2" })],
      error: null,
    });
    const stripe = { subscriptions: { cancel: vi.fn().mockResolvedValue({}) } };

    const result = await processOverdueSubscriptions({ db, stripe, now: NOW });

    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(1, "sub_stripe_1");
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(2, "sub_stripe_2");
    expect(rec.inserts).toEqual([
      {
        table: "audit_logs",
        row: {
          actor_id: null,
          action: "auto_cancelled_past_due",
          target_type: "subscription",
          target_id: "sub-row-1",
          metadata: {
            user_id: "user-1",
            stripe_subscription_id: "sub_stripe_1",
            past_due_since: "2026-09-22T11:00:00.000Z",
          },
        },
      },
      expect.objectContaining({ table: "audit_logs", row: expect.objectContaining({ target_id: "sub-row-2" }) }),
    ]);
    expect(result).toEqual({ total: 2, succeeded: 2, failed: 0, errors: [], queryFailed: false });
  });

  it("1 件の Stripe 解約が失敗しても残りは解約し、失敗を記録する（監査ログは成功分だけ）", async () => {
    const { db, rec } = makeDb({
      data: [row(), row({ id: "sub-row-2", user_id: "user-2", stripe_subscription_id: "sub_stripe_2" })],
      error: null,
    });
    const stripe = {
      subscriptions: {
        cancel: vi.fn().mockRejectedValueOnce(new Error("No such subscription")).mockResolvedValueOnce({}),
      },
    };

    const result = await processOverdueSubscriptions({ db, stripe, now: NOW });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(rec.inserts.map((i) => i.row.target_id)).toEqual(["sub-row-2"]);
    expect(result).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
      errors: [{ userId: "user-1", message: "No such subscription" }],
      queryFailed: false,
    });
  });

  it("Stripe の契約 ID が無い行は解約せず失敗として数える", async () => {
    const { db, rec } = makeDb({ data: [row({ stripe_subscription_id: null })], error: null });
    const stripe = { subscriptions: { cancel: vi.fn() } };

    const result = await processOverdueSubscriptions({ db, stripe, now: NOW });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(rec.inserts).toEqual([]);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toBe("missing stripe_subscription_id");
  });

  it("検索が失敗したら何も解約せず queryFailed を返す（呼び出し側は 500）", async () => {
    const { db } = makeDb({ data: null, error: { message: "db down" } });
    const stripe = { subscriptions: { cancel: vi.fn() } };

    const result = await processOverdueSubscriptions({ db, stripe, now: NOW });

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(result).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      errors: [{ message: "db down" }],
      queryFailed: true,
    });
  });
});
