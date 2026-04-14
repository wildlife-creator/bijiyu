import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action level tests for startCheckoutAction.
 *
 * We mock at module boundaries:
 *   - @/lib/supabase/server  → returns a fake authed/unauthed client
 *   - @/lib/supabase/admin   → returns a fake admin with controllable selects
 *   - @/lib/billing/stripe   → returns a fake Stripe whose checkout.sessions.create
 *                              returns a known URL
 *   - @/lib/billing/ensure-stripe-customer → returns a known customer ID
 *   - @/lib/billing/fee-cookie → readFeeCookie returns null/payload
 *   - next/headers → cookies()
 *
 * Tests assert the input validation, role checks, line_items shape,
 * metadata, mode, and success_url routing.
 */

// ---- mock storage / control variables ----------------------------------------

const supabaseAuthState = {
  user: null as null | { id: string },
  userRow: null as null | {
    id: string;
    role: "contractor" | "client" | "staff" | "admin";
    email: string;
  },
  userRowError: null as null | { message: string },
};

interface AdminQueryResult {
  data?: unknown;
  error?: { message: string } | null;
}

const adminResults: Record<string, AdminQueryResult> = {};

const stripeMockState: {
  sessionsCreated: Array<Stripe.Checkout.SessionCreateParams>;
  nextSession: Partial<Stripe.Checkout.Session>;
  shouldThrow: boolean;
  activeSubscriptions: Partial<Stripe.Subscription>[];
} = {
  sessionsCreated: [],
  nextSession: { url: "https://checkout.stripe.com/c/pay/cs_test_default" },
  shouldThrow: false,
  activeSubscriptions: [],
};

const ensureStripeCustomerMock = vi.fn(
  async (_admin: unknown, _stripe: unknown, _userId: string) => ({
    stripeCustomerId: "cus_default_123",
    created: false,
  }),
);

const cookiesMockState = {
  feeCookieValue: null as string | null,
};

// ---- mocks --------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: supabaseAuthState.user },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: supabaseAuthState.userRow,
            error: supabaseAuthState.userRowError,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeFakeAdmin(),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => makeFakeStripe(),
}));

vi.mock("@/lib/billing/ensure-stripe-customer", () => ({
  ensureStripeCustomer: ensureStripeCustomerMock,
}));

vi.mock("@/lib/billing/fee-cookie", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/billing/fee-cookie")>(
      "@/lib/billing/fee-cookie",
    );
  return {
    ...actual,
    readFeeCookie: vi.fn(async (raw: string | undefined | null) => {
      if (!raw) return null;
      // Treat presence as feeExempt: true for the tests
      return { feeExempt: true, expiresAt: Date.now() + 60_000 };
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bijiyu_fee" && cookiesMockState.feeCookieValue
        ? { value: cookiesMockState.feeCookieValue }
        : undefined,
  }),
}));

// ---- fake admin / stripe builders --------------------------------------------

function makeFakeAdmin() {
  // Returns chainable builders that resolve to adminResults[`${op}:${table}`].
  function builder(table: string) {
    let _op = "select";
    const filters: Record<string, unknown> = {};
    const chain = {
      _filters: filters,
      select() {
        _op = "select";
        return chain;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        return chain;
      },
      in(col: string, vals: unknown[]) {
        filters[col] = vals;
        return chain;
      },
      limit() {
        const result = adminResults[`${_op}:${table}`] ?? {
          data: [],
          error: null,
        };
        return Promise.resolve({
          data: result.data ?? [],
          error: result.error ?? null,
        });
      },
      maybeSingle() {
        const result = adminResults[`${_op}:${table}`] ?? {
          data: null,
          error: null,
        };
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
    };
    return chain;
  }
  return {
    from: (table: string) => builder(table),
  };
}

function makeFakeStripe(): Stripe {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
          if (stripeMockState.shouldThrow) {
            throw new Error("stripe failed");
          }
          stripeMockState.sessionsCreated.push(params);
          return stripeMockState.nextSession as Stripe.Checkout.Session;
        }),
      },
    },
    subscriptions: {
      list: vi.fn(async () => ({
        data: stripeMockState.activeSubscriptions,
      })),
    },
  } as unknown as Stripe;
}

// ---- import target after mocks ------------------------------------------------

const { startCheckoutAction } = await import(
  "@/app/(authenticated)/billing/actions"
);

// ---- env reset ---------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.STRIPE_PRICE_INDIVIDUAL = "price_individual";
  process.env.STRIPE_PRICE_SMALL = "price_small";
  process.env.STRIPE_PRICE_CORPORATE = "price_corporate";
  process.env.STRIPE_PRICE_CORPORATE_PREMIUM = "price_corporate_premium";
  process.env.STRIPE_PRICE_INITIAL_FEE = "price_initial_fee";
  process.env.STRIPE_PRICE_COMPENSATION_5000 = "price_comp_5000";
  process.env.STRIPE_PRICE_COMPENSATION_9800 = "price_comp_9800";
  process.env.STRIPE_PRICE_URGENT = "price_urgent";
  process.env.STRIPE_PRICE_VIDEO = "price_video";

  // Reset mock state
  supabaseAuthState.user = { id: "user-c1" };
  supabaseAuthState.userRow = {
    id: "user-c1",
    role: "contractor",
    email: "user@test.local",
  };
  supabaseAuthState.userRowError = null;
  for (const k of Object.keys(adminResults)) delete adminResults[k];
  stripeMockState.sessionsCreated = [];
  stripeMockState.nextSession = {
    url: "https://checkout.stripe.com/c/pay/cs_test_default",
  };
  stripeMockState.shouldThrow = false;
  stripeMockState.activeSubscriptions = [];
  cookiesMockState.feeCookieValue = null;
  ensureStripeCustomerMock.mockReset();
  ensureStripeCustomerMock.mockResolvedValue({
    stripeCustomerId: "cus_default_123",
    created: false,
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---- tests --------------------------------------------------------------------

describe("startCheckoutAction — auth & role checks", () => {
  it("returns error when not logged in", async () => {
    supabaseAuthState.user = null;
    const result = await startCheckoutAction({
      type: "plan",
      planType: "individual",
    });
    expect(result).toEqual({
      success: false,
      error: "ログインしてください",
    });
  });

  it("rejects staff role with the documented Japanese message", async () => {
    supabaseAuthState.userRow = {
      id: "user-c1",
      role: "staff",
      email: "staff@test.local",
    };
    const result = await startCheckoutAction({
      type: "plan",
      planType: "small",
    });
    expect(result).toEqual({
      success: false,
      error: "担当者アカウントではプランの変更はできません",
    });
  });

  it("rejects admin role", async () => {
    supabaseAuthState.userRow = {
      id: "user-c1",
      role: "admin",
      email: "admin@test.local",
    };
    const result = await startCheckoutAction({
      type: "plan",
      planType: "individual",
    });
    expect(result.success).toBe(false);
  });
});

describe("startCheckoutAction — basic plan happy path", () => {
  it("creates a subscription Checkout Session with initial fee for first purchase", async () => {
    // No subscriptions yet → first purchase, no fee=free Cookie
    adminResults["select:subscriptions"] = { data: [], error: null };
    const result = await startCheckoutAction({
      type: "plan",
      planType: "individual",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.checkoutUrl).toContain(
        "https://checkout.stripe.com/c/pay/",
      );
    }

    expect(stripeMockState.sessionsCreated).toHaveLength(1);
    const params = stripeMockState.sessionsCreated[0]!;
    expect(params.mode).toBe("subscription");
    expect(params.customer).toBe("cus_default_123");
    expect(params.line_items).toEqual([
      { price: "price_individual", quantity: 1 },
      { price: "price_initial_fee", quantity: 1 }, // initial fee added
    ]);
    expect(params.metadata).toEqual({
      type: "plan",
      user_id: "user-c1",
      plan_type: "individual",
    });
    expect(params.success_url).toBe(
      "http://localhost:3000/mypage?checkout=success",
    );
    expect(params.cancel_url).toBe("http://localhost:3000/billing");
  });

  it("skips initial fee when fee=free Cookie is present", async () => {
    adminResults["select:subscriptions"] = { data: [], error: null };
    cookiesMockState.feeCookieValue = "sealed-token";

    const result = await startCheckoutAction({
      type: "plan",
      planType: "small",
    });
    expect(result.success).toBe(true);
    const params = stripeMockState.sessionsCreated[0]!;
    expect(params.line_items).toEqual([
      { price: "price_small", quantity: 1 },
    ]);
  });

  it("法人プラン: routes success_url to /mypage/organization-setup (Task 8.7 暫定)", async () => {
    adminResults["select:subscriptions"] = { data: [], error: null };
    const result = await startCheckoutAction({
      type: "plan",
      planType: "corporate",
    });
    expect(result.success).toBe(true);
    const params = stripeMockState.sessionsCreated[0]!;
    expect(params.success_url).toBe(
      "http://localhost:3000/mypage/organization-setup",
    );
  });

  it("rejects when an active subscription already exists (二重課金防止)", async () => {
    adminResults["select:subscriptions"] = {
      data: [{ id: "existing-sub" }],
      error: null,
    };
    const result = await startCheckoutAction({
      type: "plan",
      planType: "individual",
    });
    expect(result.success).toBe(false);
    expect(stripeMockState.sessionsCreated).toHaveLength(0);
  });
});

describe("startCheckoutAction — compensation option", () => {
  it("rejects contractor (no paid plan) with the documented message", async () => {
    // contractor role
    const result = await startCheckoutAction({
      type: "option",
      optionType: "compensation_5000",
    });
    expect(result).toEqual({
      success: false,
      error:
        "補償オプションは有料プランご加入のお客様のみお申し込みいただけます",
    });
  });

  it("rejects when client has no active basic plan", async () => {
    supabaseAuthState.userRow = {
      id: "user-c1",
      role: "client",
      email: "client@test.local",
    };
    adminResults["select:subscriptions"] = { data: [], error: null };
    const result = await startCheckoutAction({
      type: "option",
      optionType: "compensation_5000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when an active compensation already exists (排他制御)", async () => {
    supabaseAuthState.userRow = {
      id: "user-c1",
      role: "client",
      email: "client@test.local",
    };
    adminResults["select:subscriptions"] = {
      data: [{ id: "existing" }],
      error: null,
    };
    adminResults["select:option_subscriptions"] = {
      data: [{ id: "existing-comp" }],
      error: null,
    };
    const result = await startCheckoutAction({
      type: "option",
      optionType: "compensation_9800",
    });
    expect(result.success).toBe(false);
  });

  it("happy path: subscription mode + correct metadata + success_url", async () => {
    supabaseAuthState.userRow = {
      id: "user-c1",
      role: "client",
      email: "client@test.local",
    };
    adminResults["select:subscriptions"] = {
      data: [{ id: "active-sub" }],
      error: null,
    };
    adminResults["select:option_subscriptions"] = { data: [], error: null };

    const result = await startCheckoutAction({
      type: "option",
      optionType: "compensation_5000",
    });
    expect(result.success).toBe(true);
    const params = stripeMockState.sessionsCreated[0]!;
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([
      { price: "price_comp_5000", quantity: 1 },
    ]);
    expect(params.metadata).toEqual({
      type: "option",
      user_id: "user-c1",
      option_type: "compensation_5000",
    });
    expect(params.success_url).toBe(
      "http://localhost:3000/billing?option_success=compensation",
    );
  });
});

describe("startCheckoutAction — urgent option", () => {
  it("rejects when caller is not the job owner and not in the same organization", async () => {
    adminResults["select:jobs"] = {
      data: {
        id: "job-99",
        owner_id: "someone-else",
        organization_id: "org-x",
        is_urgent: false,
      },
      error: null,
    };
    // 発注側ユーザーは org-x のメンバーではない
    adminResults["select:organization_members"] = { data: null, error: null };
    const result = await startCheckoutAction({
      type: "option",
      optionType: "urgent",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("対象の案件が見つからないか");
    }
  });

  it("許可: owner_id がユーザー本人の場合（個人プラン等）", async () => {
    adminResults["select:jobs"] = {
      data: { id: "job-99", owner_id: "user-c1", is_urgent: false },
      error: null,
    };
    adminResults["select:option_subscriptions"] = { data: [], error: null };
    const result = await startCheckoutAction({
      type: "option",
      optionType: "urgent",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("許可: 案件オーナーではないが同一組織のメンバーの場合（法人プラン）", async () => {
    // 案件は別のユーザー（スタッフ等）が作成したが、organization_id が同じ
    adminResults["select:jobs"] = {
      data: {
        id: "job-99",
        owner_id: "staff-in-same-org",
        organization_id: "org-1",
        is_urgent: false,
      },
      error: null,
    };
    // 発注ユーザー user-c1 は同じ組織 org-1 のメンバー
    adminResults["select:organization_members"] = {
      data: { organization_id: "org-1" },
      error: null,
    };
    adminResults["select:option_subscriptions"] = { data: [], error: null };

    const result = await startCheckoutAction({
      type: "option",
      optionType: "urgent",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("happy path: payment mode + job_id metadata", async () => {
    adminResults["select:jobs"] = {
      data: { id: "job-99", owner_id: "user-c1", is_urgent: false },
      error: null,
    };
    adminResults["select:option_subscriptions"] = { data: [], error: null };
    const result = await startCheckoutAction({
      type: "option",
      optionType: "urgent",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
    const params = stripeMockState.sessionsCreated[0]!;
    expect(params.mode).toBe("payment");
    expect(params.metadata).toEqual({
      type: "option",
      user_id: "user-c1",
      option_type: "urgent",
      job_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(params.success_url).toBe(
      "http://localhost:3000/billing?option_success=urgent",
    );
  });
});

describe("startCheckoutAction — video option", () => {
  it("happy path: payment mode and video success_url", async () => {
    const result = await startCheckoutAction({
      type: "option",
      optionType: "video",
    });
    expect(result.success).toBe(true);
    const params = stripeMockState.sessionsCreated[0]!;
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      { price: "price_video", quantity: 1 },
    ]);
    expect(params.success_url).toBe(
      "http://localhost:3000/billing?option_success=video",
    );
  });
});

describe("startCheckoutAction — error propagation", () => {
  it("returns user-facing error when ensureStripeCustomer throws", async () => {
    adminResults["select:subscriptions"] = { data: [], error: null };
    ensureStripeCustomerMock.mockRejectedValueOnce(new Error("stripe down"));
    const result = await startCheckoutAction({
      type: "plan",
      planType: "individual",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("決済準備に失敗");
    }
  });

  it("returns user-facing error when stripe.checkout.sessions.create throws", async () => {
    adminResults["select:subscriptions"] = { data: [], error: null };
    stripeMockState.shouldThrow = true;
    const result = await startCheckoutAction({
      type: "plan",
      planType: "individual",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("決済画面の作成に失敗");
    }
  });
});
