import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleCheckoutCompleted } from "@/lib/billing/webhook/handle-checkout-completed";

/**
 * Lightweight Supabase admin client mock that lets each test specify the
 * shape returned for select / insert / update / rpc calls.
 *
 * Tests inspect the recorded calls log to assert what the handler did.
 */
interface FakeOpResult {
  data?: unknown;
  error?: { message: string } | null;
}

interface FakeAdminConfig {
  /**
   * Maps `from(table) → select(...).eq(...).in(...).limit(...)` results.
   * Keyed by table name.
   */
  selectByTable?: Record<string, FakeOpResult>;
  /** Insert result per table. */
  insertByTable?: Record<string, FakeOpResult>;
  /** Update result per table. */
  updateByTable?: Record<string, FakeOpResult>;
  /** RPC results keyed by function name. */
  rpcResults?: Record<string, FakeOpResult>;
}

interface CallLog {
  op: "from" | "insert" | "update" | "select" | "rpc";
  table?: string;
  fn?: string;
  payload?: unknown;
}

function makeAdmin(config: FakeAdminConfig) {
  const calls: CallLog[] = [];

  function buildBuilder(table: string) {
    const builder = {
      _filters: {} as Record<string, unknown>,
      select: vi.fn(function (this: typeof builder) {
        return this;
      }),
      eq: vi.fn(function (this: typeof builder, col: string, val: unknown) {
        this._filters[col] = val;
        return this;
      }),
      in: vi.fn(function (this: typeof builder, col: string, vals: unknown[]) {
        this._filters[col] = vals;
        return this;
      }),
      limit: vi.fn(function (this: typeof builder) {
        const result = config.selectByTable?.[table] ?? { data: [], error: null };
        calls.push({ op: "select", table });
        return Promise.resolve({
          data: result.data ?? [],
          error: result.error ?? null,
        });
      }),
      insert: vi.fn(function (payload: unknown) {
        calls.push({ op: "insert", table, payload });
        const result = config.insertByTable?.[table] ?? { error: null };
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      }),
      update: vi.fn(function (payload: unknown) {
        calls.push({ op: "update", table, payload });
        const result = config.updateByTable?.[table] ?? { error: null };
        // chained .eq()
        return {
          eq: vi.fn(() =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
          ),
        };
      }),
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

function makeSession(
  metadata: Record<string, string>,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    metadata,
    subscription: "sub_test_123",
    customer: "cus_test_123",
    payment_intent: "pi_test_123",
    ...overrides,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// metadata.type routing
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted routing", () => {
  it("throws on unknown metadata.type", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(admin, makeSession({ type: "mystery" })),
    ).rejects.toThrow(/unknown metadata.type/);
  });

  it("throws when metadata.type is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(admin, makeSession({})),
    ).rejects.toThrow(/unknown metadata.type/);
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'plan'
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (plan)", () => {
  it("calls the handle_checkout_completed_plan RPC with the right payload", async () => {
    const { admin, calls } = makeAdmin({
      rpcResults: { handle_checkout_completed_plan: { data: {}, error: null } },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "plan",
        plan_type: "individual",
        user_id: "user-1",
      }),
    );

    const rpcCall = calls.find((c) => c.op === "rpc");
    expect(rpcCall?.fn).toBe("handle_checkout_completed_plan");
    expect(rpcCall?.payload).toMatchObject({
      event_data: {
        user_id: "user-1",
        plan_type: "individual",
        stripe_subscription_id: "sub_test_123",
        stripe_customer_id: "cus_test_123",
      },
    });
  });

  it("rethrows when the RPC returns an error", async () => {
    const { admin } = makeAdmin({
      rpcResults: {
        handle_checkout_completed_plan: {
          error: { message: "duplicate active subscription detected" },
        },
      },
    });

    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "plan",
          plan_type: "small",
          user_id: "user-2",
        }),
      ),
    ).rejects.toThrow(/duplicate active subscription/);
  });

  it("throws when subscription id is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession(
          { type: "plan", plan_type: "individual", user_id: "user-3" },
          { subscription: null },
        ),
      ),
    ).rejects.toThrow(/no subscription id/);
  });

  it("throws when user_id metadata is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({ type: "plan", plan_type: "individual" }),
      ),
    ).rejects.toThrow(/missing user_id/);
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / compensation
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (compensation option)", () => {
  it("inserts an option_subscriptions row + flips client_profiles flag", async () => {
    const { admin, calls } = makeAdmin({
      selectByTable: { option_subscriptions: { data: [], error: null } },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "compensation_5000",
        user_id: "user-cmp",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-cmp",
      payment_type: "subscription",
      stripe_subscription_id: "sub_test_123",
      option_type: "compensation_5000",
      status: "active",
    });

    const update = calls.find(
      (c) => c.op === "update" && c.table === "client_profiles",
    );
    expect(update?.payload).toEqual({ is_compensation_5000: true });
  });

  it("uses compensation_9800 flag for the higher tier", async () => {
    const { admin, calls } = makeAdmin({
      selectByTable: { option_subscriptions: { data: [], error: null } },
    });
    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "compensation_9800",
        user_id: "user-cmp",
      }),
    );
    const update = calls.find(
      (c) => c.op === "update" && c.table === "client_profiles",
    );
    expect(update?.payload).toEqual({ is_compensation_9800: true });
  });

  it("二重防御: throws when an active compensation already exists", async () => {
    const { admin, calls } = makeAdmin({
      selectByTable: {
        option_subscriptions: { data: [{ id: "existing-id" }], error: null },
      },
    });
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "option",
          option_type: "compensation_5000",
          user_id: "user-cmp",
        }),
      ),
    ).rejects.toThrow(/duplicate compensation option/);
    // Should not have inserted anything
    expect(
      calls.find((c) => c.op === "insert" && c.table === "option_subscriptions"),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / urgent
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (urgent option)", () => {
  it("inserts a one_time option_subscription with end_date 7 days out", async () => {
    const { admin, calls } = makeAdmin({});

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "urgent",
        user_id: "user-u",
        job_id: "job-99",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-u",
      job_id: "job-99",
      payment_type: "one_time",
      stripe_payment_intent_id: "pi_test_123",
      option_type: "urgent",
      status: "active",
    });
    const payload = insert?.payload as { start_date: string; end_date: string };
    const start = new Date(payload.start_date).getTime();
    const end = new Date(payload.end_date).getTime();
    // ~7 days difference (allow 1 minute slack)
    expect(end - start).toBeGreaterThan(7 * 24 * 3600 * 1000 - 60_000);
    expect(end - start).toBeLessThan(7 * 24 * 3600 * 1000 + 60_000);

    // Also flips client_profiles.is_urgent_option and jobs.is_urgent
    const cpUpdate = calls.find(
      (c) => c.op === "update" && c.table === "client_profiles",
    );
    expect(cpUpdate?.payload).toEqual({ is_urgent_option: true });
    const jobUpdate = calls.find(
      (c) => c.op === "update" && c.table === "jobs",
    );
    expect(jobUpdate?.payload).toEqual({ is_urgent: true });
  });

  it("throws when job_id metadata is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "option",
          option_type: "urgent",
          user_id: "user-u",
        }),
      ),
    ).rejects.toThrow(/missing job_id/);
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / video
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (video option)", () => {
  it("inserts a one_time option_subscription with end_date null", async () => {
    const { admin, calls } = makeAdmin({});

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "video",
        user_id: "user-v",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-v",
      payment_type: "one_time",
      stripe_payment_intent_id: "pi_test_123",
      option_type: "video",
      status: "active",
      end_date: null,
    });
  });
});
