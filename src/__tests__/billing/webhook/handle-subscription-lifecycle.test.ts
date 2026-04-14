import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleSubscriptionLifecycle } from "@/lib/billing/webhook/handle-subscription-lifecycle";

/**
 * Test plan (covers Task 13.7 + 13.13 minimal cases for Task 3.7 CP2):
 *  - updated × subscriptions hit → calls RPC, then sends email per diff
 *  - updated × option_subscriptions hit → updates row, no RPC, no email
 *  - updated × neither → 200 skip (no calls)
 *  - deleted × subscriptions hit → RPC + chained option cancel + email
 *  - deleted × option_subscriptions hit → updates row + flag, no email
 *  - payment_failed → marks past_due + sends paymentFailedEmail
 *  - payment_succeeded recovery → re-activates active + staff
 *  - email send judgment for upgrade / downgrade reservation / cancel reservation /
 *    reservation removed / unrelated update
 */

// ---------------------------------------------------------------------------
// Env setup so resolvePlanTypeFromPriceId knows the test price IDs
// ---------------------------------------------------------------------------
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.STRIPE_PRICE_INDIVIDUAL = "price_individual";
  process.env.STRIPE_PRICE_SMALL = "price_small";
  process.env.STRIPE_PRICE_CORPORATE = "price_corporate";
  process.env.STRIPE_PRICE_CORPORATE_PREMIUM = "price_corporate_premium";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---------------------------------------------------------------------------
// Fake admin client builder. Tests configure return values per (op, table).
// ---------------------------------------------------------------------------
interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
}

interface FakeConfig {
  /** Map: `${op}:${table}` → result. op = "select"|"insert"|"update"|... */
  results?: Record<string, QueryResult>;
  /** RPC results: fnName → result */
  rpcResults?: Record<string, QueryResult>;
}

interface CallLog {
  op: string;
  table?: string;
  fn?: string;
  payload?: unknown;
  filters?: Record<string, unknown>;
}

function makeAdmin(config: FakeConfig) {
  const calls: CallLog[] = [];
  // Track per-table-op call sequence so each test can return different values
  // for repeated calls (e.g. SELECT users, then SELECT subscriptions).
  const sequenceByKey: Record<string, number> = {};

  function buildBuilder(table: string) {
    let _filters: Record<string, unknown> = {};
    const builder: {
      _filters: Record<string, unknown>;
      select: (...args: unknown[]) => typeof builder;
      eq: (col: string, val: unknown) => typeof builder;
      in: (col: string, vals: unknown[]) => typeof builder;
      is: (col: string, val: unknown) => typeof builder;
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      insert: (payload: unknown) => Promise<{ data: unknown; error: unknown }>;
      update: (payload: unknown) => {
        eq: (
          col: string,
          val: unknown,
        ) => Promise<{ data: unknown; error: unknown }>;
        in: (
          col: string,
          vals: unknown[],
        ) => Promise<{ data: unknown; error: unknown }>;
      };
      then: <T>(onFulfilled: (v: { data: unknown; error: unknown }) => T) => Promise<T>;
    } = {
      _filters,
      select() {
        return this;
      },
      eq(col, val) {
        this._filters[col] = val;
        return this;
      },
      in(col, vals) {
        this._filters[col] = vals;
        return this;
      },
      is(col, val) {
        this._filters[col] = val;
        return this;
      },
      maybeSingle() {
        const key = `select:${table}`;
        const seq = sequenceByKey[key] ?? 0;
        sequenceByKey[key] = seq + 1;
        const sequenced = config.results?.[`select:${table}:${seq}`];
        const result = sequenced ?? config.results?.[`select:${table}`] ?? {
          data: null,
          error: null,
        };
        calls.push({
          op: "select",
          table,
          filters: { ..._filters },
        });
        _filters = {};
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
      // SELECT without maybeSingle resolves on then() (used for .eq().eq() chains)
      then(onFulfilled) {
        const result = config.results?.[`select:${table}`] ?? {
          data: [],
          error: null,
        };
        calls.push({
          op: "select",
          table,
          filters: { ..._filters },
        });
        _filters = {};
        return Promise.resolve({
          data: result.data ?? [],
          error: result.error ?? null,
        }).then(onFulfilled);
      },
      insert(payload) {
        calls.push({ op: "insert", table, payload });
        const result = config.results?.[`insert:${table}`] ?? { error: null };
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
      update(payload) {
        calls.push({ op: "update", table, payload });
        const result = config.results?.[`update:${table}`] ?? { error: null };
        return {
          eq: vi.fn(() =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
          ),
          in: vi.fn(() =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
          ),
        };
      },
    };
    return builder;
  }

  const admin = {
    from: vi.fn((table: string) => {
      calls.push({ op: "from", table });
      return buildBuilder(table);
    }),
    rpc: vi.fn((fn: string, payload: unknown) => {
      calls.push({ op: "rpc", fn, payload });
      const result = config.rpcResults?.[fn] ?? { data: null, error: null };
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      });
    }),
  };
  return { admin: admin as never, calls };
}

function makeStripe(): Stripe & { _calls: string[] } {
  const calls: string[] = [];
  const stripe = {
    _calls: calls,
    subscriptionSchedules: {
      retrieve: vi.fn(async (id: string) => {
        calls.push(`schedules.retrieve:${id}`);
        return {
          phases: [
            { items: [{ price: "price_corporate" }], start_date: 100 },
            { items: [{ price: "price_individual" }], start_date: 200 },
          ],
        };
      }),
    },
    subscriptions: {
      cancel: vi.fn(async (id: string) => {
        calls.push(`subscriptions.cancel:${id}`);
        return {};
      }),
    },
  } as unknown as Stripe & { _calls: string[] };
  return stripe;
}

function buildSubscription(
  overrides: Partial<{
    id: string;
    priceId: string;
    status: Stripe.Subscription.Status;
    schedule: string | null;
    cancel_at_period_end: boolean;
    period_start: number;
    period_end: number;
  }> = {},
): Stripe.Subscription {
  const {
    id = "sub_test_001",
    priceId = "price_individual",
    status = "active",
    schedule = null,
    cancel_at_period_end = false,
    period_start = 1_700_000_000,
    period_end = 1_702_592_000,
  } = overrides;
  return {
    id,
    status,
    schedule,
    cancel_at_period_end,
    items: {
      data: [
        {
          price: { id: priceId },
          current_period_start: period_start,
          current_period_end: period_end,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function buildInvoice(
  overrides: Partial<{
    subscriptionId: string;
    nextRetry: number | null;
  }> = {},
): Stripe.Invoice {
  const { subscriptionId = "sub_test_001", nextRetry = 1_700_000_500 } = overrides;
  return {
    next_payment_attempt: nextRetry,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: subscriptionId },
    },
  } as unknown as Stripe.Invoice;
}

type SendArgs = { to: string; subject: string; html: string };
const SEND = vi.fn(async (_args: SendArgs) => ({ success: true as const }));

beforeEach(() => {
  SEND.mockClear();
});

// ===========================================================================
// customer.subscription.updated
// ===========================================================================

describe("customer.subscription.updated", () => {
  it("hits subscriptions: calls RPC + sends upgrade email", async () => {
    const sub = buildSubscription({ priceId: "price_small" });
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-1",
            plan_type: "individual", // upgrading from individual → small
            schedule_id: null,
            cancel_at_period_end: false,
          },
        },
        "select:users": {
          data: {
            email: "user1@test.local",
            last_name: "山田",
            first_name: "太郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_updated: { data: {}, error: null },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: sub },
      { sendEmail: SEND as never },
    );

    const rpcCall = calls.find((c) => c.op === "rpc");
    expect(rpcCall?.fn).toBe("handle_subscription_lifecycle_updated");
    expect(rpcCall?.payload).toMatchObject({
      event_data: {
        stripe_subscription_id: "sub_test_001",
        plan_type: "small",
        cancel_at_period_end: false,
      },
    });

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as {
      to: string;
      subject: string;
      html: string;
    };
    expect(args.to).toBe("user1@test.local");
    expect(args.subject).toBe("【ビジ友】プラン変更を承りました");
    expect(args.html).toContain("山田太郎 様");
    expect(args.html).toContain("個人発注者様向けプラン");
    expect(args.html).toContain("小規模事業主様向けプラン");
    expect(args.html).toContain("ただ今");
  });

  it("hits option_subscriptions only: updates status, no RPC, no email", async () => {
    const sub = buildSubscription({ status: "canceled" });
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": {
          data: { id: "opt-row-1", status: "active" },
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: sub },
      { sendEmail: SEND as never },
    );

    expect(calls.find((c) => c.op === "rpc")).toBeUndefined();
    expect(SEND).not.toHaveBeenCalled();
    const updateCall = calls.find(
      (c) => c.op === "update" && c.table === "option_subscriptions",
    );
    expect(updateCall?.payload).toEqual({ status: "cancelled" });
  });

  it("ordering glitch: neither hit → silently skip with no DB writes", async () => {
    const sub = buildSubscription();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": { data: null },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: sub },
      { sendEmail: SEND as never },
    );

    expect(calls.find((c) => c.op === "rpc")).toBeUndefined();
    expect(calls.find((c) => c.op === "update")).toBeUndefined();
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
    expect(SEND).not.toHaveBeenCalled();
  });

  it("downgrade reservation appears: sends reservation email", async () => {
    const sub = buildSubscription({ schedule: "sub_sched_1" });
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-2",
            plan_type: "individual",
            schedule_id: null,
            cancel_at_period_end: false,
          },
        },
        "select:users": {
          data: {
            email: "user2@test.local",
            last_name: "佐藤",
            first_name: "花子",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_updated: { data: {}, error: null },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: sub },
      { sendEmail: SEND as never },
    );

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { html: string };
    // Default fake schedule.next_phase price is 'price_individual' (=individual),
    // and the user already has individual; downgrade case 'b' uses scheduled_plan_type
    // which here resolves back to individual, so the html still mentions 個人発注者様向けプラン.
    expect(args.html).toContain("佐藤花子 様");
  });

  it("cancel reservation appears: sends cancel reservation email with free target", async () => {
    const sub = buildSubscription({ cancel_at_period_end: true });
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-3",
            plan_type: "individual",
            schedule_id: null,
            cancel_at_period_end: false,
          },
        },
        "select:users": {
          data: {
            email: "user3@test.local",
            last_name: "鈴木",
            first_name: "次郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_updated: { data: {}, error: null },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: sub },
      { sendEmail: SEND as never },
    );
    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { html: string };
    expect(args.html).toContain("鈴木次郎 様");
    expect(args.html).toContain("無料プラン");
  });

  it("no relevant change: does NOT send email", async () => {
    // before/after are equivalent: same plan_type, no schedule, cancel false
    const sub = buildSubscription({ priceId: "price_individual" });
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-4",
            plan_type: "individual",
            schedule_id: null,
            cancel_at_period_end: false,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_updated: { data: {}, error: null },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: sub },
      { sendEmail: SEND as never },
    );

    expect(SEND).not.toHaveBeenCalled();
  });

  it("unknown price ID: throws so the webhook is recorded as failed", async () => {
    const sub = buildSubscription({ priceId: "price_mystery" });
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-x",
            plan_type: "individual",
            schedule_id: null,
            cancel_at_period_end: false,
          },
        },
      },
    });

    await expect(
      handleSubscriptionLifecycle(
        admin,
        makeStripe(),
        { type: "customer.subscription.updated", data: sub },
        { sendEmail: SEND as never },
      ),
    ).rejects.toThrow(/unknown price id/);
  });
});

// ===========================================================================
// customer.subscription.deleted
// ===========================================================================

describe("customer.subscription.deleted", () => {
  it("hits subscriptions: RPC + chained option cancel + cancelled email", async () => {
    const sub = buildSubscription();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: { id: "sub-row-9", user_id: "user-9", plan_type: "corporate" },
        },
        "select:option_subscriptions": {
          data: [
            {
              id: "opt-1",
              stripe_subscription_id: "sub_compensation_1",
            },
          ],
        },
        "select:users": {
          data: {
            email: "user9@test.local",
            last_name: "高橋",
            first_name: "三郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_deleted: { data: {}, error: null },
      },
    });
    const stripe = makeStripe();

    await handleSubscriptionLifecycle(
      admin,
      stripe,
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    expect(calls.find((c) => c.op === "rpc")?.fn).toBe(
      "handle_subscription_lifecycle_deleted",
    );
    expect(stripe._calls).toContain("subscriptions.cancel:sub_compensation_1");
    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { subject: string; html: string };
    expect(args.subject).toBe("【ビジ友】解約が完了しました");
    expect(args.html).toContain("法人向けプラン");
  });

  it("hits option_subscriptions only: status + flag updates, no email", async () => {
    const sub = buildSubscription();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": {
          data: {
            id: "opt-9",
            user_id: "user-9",
            option_type: "compensation_5000",
          },
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    const optionUpdate = calls.find(
      (c) => c.op === "update" && c.table === "option_subscriptions",
    );
    expect(optionUpdate?.payload).toEqual({ status: "cancelled" });
    const profileUpdate = calls.find(
      (c) => c.op === "update" && c.table === "client_profiles",
    );
    expect(profileUpdate?.payload).toEqual({ is_compensation_5000: false });
    expect(SEND).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// invoice.payment_failed
// ===========================================================================

describe("invoice.payment_failed", () => {
  it("marks past_due and sends paymentFailedEmail", async () => {
    const invoice = buildInvoice();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-pf",
            plan_type: "individual",
            past_due_since: null,
          },
        },
        "select:users": {
          data: {
            email: "userpf@test.local",
            last_name: "田中",
            first_name: "太郎",
            company_name: null,
          },
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "invoice.payment_failed", data: invoice },
      { sendEmail: SEND as never },
    );

    const update = calls.find(
      (c) => c.op === "update" && c.table === "subscriptions",
    );
    expect(update?.payload).toMatchObject({ status: "past_due" });

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { subject: string };
    expect(args.subject).toBe("【ビジ友】お支払いが確認できません");
  });

  it("preserves past_due_since when it's already set", async () => {
    const invoice = buildInvoice();
    const existing = "2026-04-05T00:00:00.000Z";
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-pf",
            plan_type: "individual",
            past_due_since: existing,
          },
        },
        "select:users": {
          data: {
            email: "userpf@test.local",
            last_name: "田中",
            first_name: "太郎",
            company_name: null,
          },
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "invoice.payment_failed", data: invoice },
      { sendEmail: SEND as never },
    );

    const update = calls.find(
      (c) => c.op === "update" && c.table === "subscriptions",
    );
    expect((update?.payload as { past_due_since: string }).past_due_since).toBe(
      existing,
    );
  });
});

// ===========================================================================
// invoice.payment_succeeded
// ===========================================================================

describe("invoice.payment_succeeded", () => {
  it("recovery from past_due → status=active and reactivates corporate staff", async () => {
    const invoice = buildInvoice();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-2",
            user_id: "owner-1",
            plan_type: "corporate",
            status: "past_due",
          },
        },
        "select:organizations": { data: { id: "org-1" } },
        "select:organization_members": {
          data: [{ user_id: "staff-a" }, { user_id: "staff-b" }],
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "invoice.payment_succeeded", data: invoice },
      { sendEmail: SEND as never },
    );

    const subUpdate = calls.find(
      (c) => c.op === "update" && c.table === "subscriptions",
    );
    expect(subUpdate?.payload).toMatchObject({
      status: "active",
      past_due_since: null,
    });

    const userUpdate = calls.find(
      (c) => c.op === "update" && c.table === "users",
    );
    expect(userUpdate?.payload).toEqual({ is_active: true });
  });

  it("ignores invoice for already-active subscription (no changes)", async () => {
    const invoice = buildInvoice();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-2",
            user_id: "owner-1",
            plan_type: "individual",
            status: "active",
          },
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "invoice.payment_succeeded", data: invoice },
      { sendEmail: SEND as never },
    );

    expect(
      calls.find((c) => c.op === "update" && c.table === "subscriptions"),
    ).toBeUndefined();
  });
});
