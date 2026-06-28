import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleSubscriptionLifecycle } from "@/lib/billing/webhook/handle-subscription-lifecycle";

// Task 8: applyDeletedSuffix を module-mock してファンアウト呼び出しを検証できるようにする
const { applyDeletedSuffixMock } = vi.hoisted(() => ({
  applyDeletedSuffixMock: vi.fn(),
}));
vi.mock("@/lib/email-recycle/apply-deleted-suffix", () => ({
  applyDeletedSuffix: applyDeletedSuffixMock,
}));

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
  applyDeletedSuffixMock.mockReset();
  applyDeletedSuffixMock.mockResolvedValue({
    kind: "applied",
    recycledEmail: "stub",
  });
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

  it("cancel reservation appears (§6.1-B): subject「解約をご予約いただきました」, body has endDate + 有料プラン明記, 無料プラン表現なし", async () => {
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
    const args = SEND.mock.calls[0]![0]! as { subject: string; html: string };
    expect(args.subject).toBe("【ビジ友】解約をご予約いただきました");
    expect(args.html).toContain("鈴木次郎 様");
    expect(args.html).toContain("ビジ友の解約をご予約いただきました");
    expect(args.html).toContain("有料プランでのご利用が終了します");
    expect(args.html).not.toContain("無料プラン");
  });

  it("§6.1-C-1 downgrade reservation removed (schedule_id non-null → null): subject 「ご予約を取り消しました」, 本文「プラン変更を取り消しました」", async () => {
    // before: schedule_id 設定済 / after: schedule_id 解除 (Stripe schedule null + same plan)
    const sub = buildSubscription({ schedule: null });
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-1",
            user_id: "user-c1",
            plan_type: "corporate",
            schedule_id: "sub_sched_existing",
            cancel_at_period_end: false,
          },
        },
        "select:users": {
          data: {
            email: "userc1@test.local",
            last_name: "中村",
            first_name: "一郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_updated: { data: {}, error: null },
      },
    });

    // sub.items.data[0].price.id = "price_individual" by default → newPlanType = individual
    // but before.plan_type = corporate ≠ individual → upgrade branch would fire first.
    // To force (d-1) we need before.plan_type === after.planType. Override priceId.
    const subFixed = buildSubscription({
      schedule: null,
      priceId: "price_corporate",
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.updated", data: subFixed },
      { sendEmail: SEND as never },
    );

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { subject: string; html: string };
    expect(args.subject).toBe("【ビジ友】ご予約を取り消しました");
    expect(args.html).toContain("中村一郎 様");
    expect(args.html).toContain("先日ご予約いただいたプラン変更を取り消しました");
    expect(args.html).toContain("法人向けプラン");
  });

  it("§6.1-C-2 cancel reservation removed (cancel_at_period_end true → false): subject 「ご予約を取り消しました」, 本文「解約を取り消しました」", async () => {
    const sub = buildSubscription({
      cancel_at_period_end: false,
      priceId: "price_individual",
    });
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: {
            id: "sub-row-2",
            user_id: "user-c2",
            plan_type: "individual",
            schedule_id: null,
            cancel_at_period_end: true,
          },
        },
        "select:users": {
          data: {
            email: "userc2@test.local",
            last_name: "渡辺",
            first_name: "良子",
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
    const args = SEND.mock.calls[0]![0]! as { subject: string; html: string };
    expect(args.subject).toBe("【ビジ友】ご予約を取り消しました");
    expect(args.html).toContain("渡辺良子 様");
    expect(args.html).toContain("先日ご予約いただいた解約を取り消しました");
    expect(args.html).toContain("個人発注者様向けプラン");
    expect(args.html).toContain("今後も引き続き");
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
  it("hits subscriptions: RPC + cancelled email, **no chained option cancel**", async () => {
    // 仕様変更（2026-05-09）: 補償オプションは受注者向け給与未払い保険として
    // 基本プランから独立。基本プラン解約時に補償オプションを連鎖キャンセル
    // しないことを検証する（旧 Gap 3 ロジックは廃止）。
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
    // 連鎖キャンセル廃止: stripe.subscriptions.cancel は呼ばれない
    expect(stripe._calls).not.toContain(
      "subscriptions.cancel:sub_compensation_1",
    );
    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { subject: string; html: string };
    expect(args.subject).toBe("【ビジ友】有料プランのご解約が完了しました");
    expect(args.html).toContain("法人向けプラン");
  });

  it("hits option_subscriptions only: status='cancelled' update, no client_profiles write, no email", async () => {
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
    // client_profiles のフラグカラムは廃止済み。書き込みが発生しないことを検証
    expect(
      calls.find((c) => c.op === "update" && c.table === "client_profiles"),
    ).toBeUndefined();
    expect(SEND).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Task 8: applyDeletedSuffix のループ統合
  // -------------------------------------------------------------------------
  it("Task 8: globally_deleted_user_ids が空配列 → applyDeletedSuffix は 1 度も呼ばれない", async () => {
    const sub = buildSubscription();
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: { id: "sub-row-x", user_id: "user-x", plan_type: "individual" },
        },
        "select:users": {
          data: {
            email: "userx@test.local",
            last_name: "佐藤",
            first_name: "太郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_deleted: {
          data: { globally_deleted_user_ids: [] },
          error: null,
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    expect(applyDeletedSuffixMock).not.toHaveBeenCalled();
  });

  it("Task 8: globally_deleted_user_ids 1 件 → 1 回 applyDeletedSuffix が呼ばれる", async () => {
    const sub = buildSubscription();
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: { id: "sub-row-1", user_id: "user-o", plan_type: "corporate" },
        },
        "select:users": {
          data: {
            email: "owner@test.local",
            last_name: "高橋",
            first_name: "二郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_deleted: {
          data: { globally_deleted_user_ids: ["staff-a"] },
          error: null,
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(1);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(admin, "staff-a", {
      path: "subscription_deleted",
      actorId: null,
    });
  });

  it("Task 8: globally_deleted_user_ids 複数件 → 全 user_id で applyDeletedSuffix が呼ばれる", async () => {
    const sub = buildSubscription();
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: { id: "sub-row-2", user_id: "user-o", plan_type: "corporate" },
        },
        "select:users": {
          data: {
            email: "owner@test.local",
            last_name: "高橋",
            first_name: "二郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_deleted: {
          data: { globally_deleted_user_ids: ["staff-a", "staff-b", "staff-c"] },
          error: null,
        },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(3);
    const calledUserIds = applyDeletedSuffixMock.mock.calls.map((c) => c[1]);
    expect(calledUserIds).toEqual(["staff-a", "staff-b", "staff-c"]);
  });

  it("§6.5 退会 suppression: users.deleted_at != null なら §6.2 解約メールは送らない (RPC は通常通り実行)", async () => {
    const sub = buildSubscription();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: { id: "sub-row-w", user_id: "user-w", plan_type: "corporate" },
        },
        // 退会済ユーザー
        "select:users": {
          data: {
            deleted_at: "2026-06-10T00:00:00.000Z",
            email: "withdrawn@test.local",
            last_name: "山田",
            first_name: "太郎",
            client_profiles: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_deleted: { data: {}, error: null },
      },
    });

    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    // RPC は通常通り呼ばれる（退会フローの DB 整合性は維持）
    expect(calls.find((c) => c.op === "rpc")?.fn).toBe(
      "handle_subscription_lifecycle_deleted",
    );
    // §6.2 メールは送らない（E-8 退会通知に集約）
    expect(SEND).not.toHaveBeenCalled();
  });

  it("§6.5.C manual パターン: option_subscriptions hit + cancellation_requested → 補償解約完了メール送信", async () => {
    const sub = buildSubscription();
    // Stripe cancellation_details を後付け（buildSubscription は素の型なので unknown キャスト）
    (sub as unknown as { cancellation_details: { reason: string } }).cancellation_details = {
      reason: "cancellation_requested",
    };

    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": {
          data: {
            id: "opt-c",
            user_id: "user-c",
            option_type: "compensation_5000",
          },
        },
        "select:users": {
          data: {
            deleted_at: null,
            email: "cmp@test.local",
            last_name: "中村",
            first_name: "次郎",
            client_profiles: null,
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

    expect(calls.find(
      (c) => c.op === "update" && c.table === "option_subscriptions",
    )?.payload).toEqual({ status: "cancelled" });
    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { subject: string; html: string };
    expect(args.subject).toBe(
      "【ビジ友】補償オプションのご解約が完了しました",
    );
    expect(args.html).toContain("中村次郎 様");
    expect(args.html).toContain("補償（5,000円/月、最大200万円）");
    expect(args.html).toContain("以下の内容で補償オプションの解約が完了しました");
    // manual パスでは stripe-dunning 専用 opening は含まない
    expect(args.html).not.toContain("お支払い方法での決済が確認できないまま");
  });

  it("§6.5.C stripe-dunning パターン: cancellation_details.reason=payment_failed → opening が「決済が確認できないまま日数が経過したため」に切替", async () => {
    const sub = buildSubscription();
    (sub as unknown as { cancellation_details: { reason: string } }).cancellation_details = {
      reason: "payment_failed",
    };
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": {
          data: {
            id: "opt-d",
            user_id: "user-d",
            option_type: "compensation_9800",
          },
        },
        "select:users": {
          data: {
            deleted_at: null,
            email: "dun@test.local",
            last_name: "鈴木",
            first_name: "三郎",
            client_profiles: null,
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

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as { html: string };
    expect(args.html).toContain(
      "お支払い方法での決済が確認できないまま日数が経過したため",
    );
    expect(args.html).toContain("補償（9,800円/月、最大500万円）");
  });

  it("§6.5 退会 suppression (option path): users.deleted_at != null → §6.5.C メール skip, option_subscriptions UPDATE は実行", async () => {
    const sub = buildSubscription();
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": {
          data: {
            id: "opt-w",
            user_id: "user-cw",
            option_type: "compensation_5000",
          },
        },
        "select:users": {
          data: {
            deleted_at: "2026-06-10T00:00:00.000Z",
            email: "withdrawn-cmp@test.local",
            last_name: "退会",
            first_name: "太郎",
            client_profiles: null,
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

    // UPDATE は通常通り
    expect(
      calls.find((c) => c.op === "update" && c.table === "option_subscriptions")?.payload,
    ).toEqual({ status: "cancelled" });
    // §6.5.C メールは送らない
    expect(SEND).not.toHaveBeenCalled();
  });

  it("Task 8: 1 件目が throw しても残りの呼び出しは継続 (partial-success)", async () => {
    const sub = buildSubscription();
    const { admin } = makeAdmin({
      results: {
        "select:subscriptions": {
          data: { id: "sub-row-3", user_id: "user-o", plan_type: "corporate" },
        },
        "select:users": {
          data: {
            email: "owner@test.local",
            last_name: "高橋",
            first_name: "二郎",
            company_name: null,
          },
        },
      },
      rpcResults: {
        handle_subscription_lifecycle_deleted: {
          data: { globally_deleted_user_ids: ["staff-a", "staff-b"] },
          error: null,
        },
      },
    });

    applyDeletedSuffixMock.mockReset();
    applyDeletedSuffixMock.mockRejectedValueOnce(new Error("api down"));
    applyDeletedSuffixMock.mockResolvedValueOnce({
      kind: "applied",
      recycledEmail: "stub",
    });

    // Webhook 全体が throw しないこと (Stripe 再送抑制)
    await handleSubscriptionLifecycle(
      admin,
      makeStripe(),
      { type: "customer.subscription.deleted", data: sub },
      { sendEmail: SEND as never },
    );

    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(2);
    // 2 件目は throw 後でも実行される
    expect(applyDeletedSuffixMock.mock.calls[1]?.[1]).toBe("staff-b");
    // 連鎖キャンセル後の email 送信も継続している (最後まで処理完走)
    expect(SEND).toHaveBeenCalled();
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
    expect(args.subject).toBe("【ビジ友】有料プランのお支払いが確認できませんでした");
  });

  it("§6.5.B: subscriptions miss + option_subscriptions hit (compensation) → sends optionPaymentFailedEmail, no DB update on option_subscriptions", async () => {
    const invoice = buildInvoice({ subscriptionId: "sub_compensation_1" });
    const { admin, calls } = makeAdmin({
      results: {
        "select:subscriptions": { data: null },
        "select:option_subscriptions": {
          data: {
            id: "opt-cmp-1",
            user_id: "user-cmp",
            option_type: "compensation_5000",
          },
        },
        "select:users": {
          data: {
            email: "cmp@test.local",
            last_name: "田中",
            first_name: "太郎",
            client_profiles: null,
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

    // 補償オプションは Stripe dunning に委ねる方針: option_subscriptions の DB 状態は変更しない
    expect(
      calls.find((c) => c.op === "update" && c.table === "option_subscriptions"),
    ).toBeUndefined();
    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as {
      to: string;
      subject: string;
      html: string;
    };
    expect(args.to).toBe("cmp@test.local");
    expect(args.subject).toBe(
      "【ビジ友】補償オプションのお支払いが確認できませんでした",
    );
    expect(args.html).toContain("補償（5,000円/月、最大200万円）");
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
  it("recovery from past_due → status=active (no corporate staff reactivation)", async () => {
    // Phase 5 (proxy-account-multi-org-support) で reactivateCorporateMembers
    // を撤廃した。past_due → active 復帰時に users.is_active を書き換える
    // 旧挙動はなくなり、subscriptions のステータス更新のみ行われる。
    // 配下メンバーの「凍結」「復帰」は org_members 行削除モデルに置き換わったため
    // ここでは何もしない (organizations / organization_members の SELECT も発生しない)。
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

    // users への UPDATE は発生しない (is_active=true の旧復帰挙動廃止)
    expect(
      calls.find((c) => c.op === "update" && c.table === "users"),
    ).toBeUndefined();
    // organizations / organization_members の SELECT も発生しない
    expect(
      calls.find((c) => c.op === "select" && c.table === "organizations"),
    ).toBeUndefined();
    expect(
      calls.find(
        (c) => c.op === "select" && c.table === "organization_members",
      ),
    ).toBeUndefined();
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
