import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for changePlanAction and related plan-change Server Actions.
 *
 * We mock all external deps:
 *   - @/lib/supabase/server → returns a controlled auth client
 *   - @/lib/supabase/admin → returns a controlled admin client
 *   - @/lib/billing/stripe → returns a controlled Stripe client
 *   - @/lib/billing/validate-downgrade → controllable result
 */

// ---- mock state -----

const authState = {
  user: null as null | { id: string },
  userRow: null as null | { role: string },
};

const subState = {
  row: null as null | {
    id: string;
    user_id: string;
    plan_type: string;
    status: string;
    stripe_subscription_id: string;
    schedule_id: string | null;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  },
};

const stripeMock = {
  subscriptions: {
    retrieve: vi.fn(async () => ({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_individual" } }] },
      schedule: null,
      cancel_at_period_end: false,
    })),
    update: vi.fn(async () => ({})),
    cancel: vi.fn(async () => ({})),
  },
  subscriptionSchedules: {
    create: vi.fn(async () => ({
      id: "sub_sched_1",
      phases: [
        {
          items: [{ price: "price_corporate", quantity: 1 }],
          start_date: 1000,
          end_date: 2000,
        },
      ],
    })),
    update: vi.fn(async () => ({})),
    release: vi.fn(async () => ({})),
  },
  billingPortal: {
    sessions: {
      create: vi.fn(async () => ({ url: "https://billing.stripe.com/test" })),
    },
  },
};

type ValidationResult = { ok: true } | { ok: false; errors: string[] };
const validateMock = vi.fn(async (): Promise<ValidationResult> => ({ ok: true }));

const adminInserts: Array<{ table: string; payload: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.userRow,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const adminUserState = {
  stripe_customer_id: "cus_test_1" as string | null,
};

const adminUpdates: Array<{ table: string; payload: unknown; eqArgs: unknown[] }> = [];
const adminRpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (..._args: unknown[]) => {
          if (table === "users") {
            return {
              single: async () => ({
                data: { stripe_customer_id: adminUserState.stripe_customer_id },
                error: null,
              }),
            };
          }
          return {
            in: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: subState.row,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
      insert: (payload: unknown) => {
        adminInserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: unknown) => ({
        eq: async (...args: unknown[]) => {
          adminUpdates.push({ table, payload, eqArgs: args });
          return { error: null };
        },
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      adminRpcCalls.push({ fn, args });
      return { error: null };
    },
  }),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => stripeMock,
}));

vi.mock("@/lib/billing/validate-downgrade", () => ({
  validateDowngradePrerequisites: validateMock,
}));

const {
  changePlanAction,
  cancelDowngradeReservationAction,
  scheduleCancelAction,
  cancelImmediatelyAction,
  openCustomerPortalAction,
} = await import("@/app/(authenticated)/billing/plan-actions");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.STRIPE_PRICE_INDIVIDUAL = "price_individual";
  process.env.STRIPE_PRICE_SMALL = "price_small";
  process.env.STRIPE_PRICE_CORPORATE = "price_corporate";
  process.env.STRIPE_PRICE_CORPORATE_PREMIUM = "price_corporate_premium";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.STRIPE_PORTAL_CONFIGURATION_ID = "bpc_test";

  authState.user = { id: "user-1" };
  authState.userRow = { role: "client" };
  subState.row = {
    id: "sub-row-1",
    user_id: "user-1",
    plan_type: "individual",
    status: "active",
    stripe_subscription_id: "sub_1",
    schedule_id: null,
    cancel_at_period_end: false,
    current_period_end: "2026-05-01T00:00:00Z",
  };
  adminInserts.length = 0;
  adminUpdates.length = 0;
  adminRpcCalls.length = 0;
  vi.clearAllMocks();
  validateMock.mockResolvedValue({ ok: true } as ValidationResult);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---- changePlanAction ----

describe("changePlanAction", () => {
  it("routes to upgrade when target > current", async () => {
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.performedType).toBe("upgrade");
      expect(result.data?.newPlanName).toBe("小規模事業主様向けプラン");
    }
    expect(stripeMock.subscriptions.update).toHaveBeenCalledOnce();
    // Webhook race 回避のため subscriptions.plan_type を同期的に先行 UPDATE している
    const planTypeUpdate = adminUpdates.find(
      (u) =>
        u.table === "subscriptions" &&
        (u.payload as { plan_type?: string }).plan_type === "small",
    );
    expect(planTypeUpdate).toBeDefined();
    // 法人プラン以外なので ensure_organization_exists は呼ばれない
    expect(
      adminRpcCalls.find((r) => r.fn === "ensure_organization_exists"),
    ).toBeUndefined();
  });

  it("法人プランへのアップグレード時に ensure_organization_exists RPC を同期的に呼ぶ", async () => {
    const result = await changePlanAction({ targetPlan: "corporate" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.performedType).toBe("upgrade");
    }
    // subscriptions.plan_type 先行 UPDATE
    const planTypeUpdate = adminUpdates.find(
      (u) =>
        u.table === "subscriptions" &&
        (u.payload as { plan_type?: string }).plan_type === "corporate",
    );
    expect(planTypeUpdate).toBeDefined();
    // ensure_organization_exists 先行 RPC（Webhook 到達前にクライアントが
    // /mypage/client-profile/edit?setup=true へ遷移してもガードを通れるようにするため）
    const ensureOrgCall = adminRpcCalls.find(
      (r) => r.fn === "ensure_organization_exists",
    );
    expect(ensureOrgCall).toBeDefined();
    expect((ensureOrgCall!.args as { uid: string }).uid).toBe("user-1");
  });

  it("法人高サポートプランへのアップグレード時も ensure_organization_exists を呼ぶ", async () => {
    const result = await changePlanAction({ targetPlan: "corporate_premium" });
    expect(result.success).toBe(true);
    const ensureOrgCall = adminRpcCalls.find(
      (r) => r.fn === "ensure_organization_exists",
    );
    expect(ensureOrgCall).toBeDefined();
  });

  it("routes to downgrade when target < current", async () => {
    subState.row!.plan_type = "corporate";
    const result = await changePlanAction({ targetPlan: "individual" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.performedType).toBe("downgrade");
    }
    expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalledOnce();
  });

  it("returns error on same plan", async () => {
    const result = await changePlanAction({ targetPlan: "individual" });
    expect(result).toEqual({
      success: false,
      error: "同じプランへの変更はできません",
    });
  });

  it("returns error when past_due", async () => {
    subState.row!.status = "past_due";
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result.success).toBe(false);
  });

  it("returns error when a reservation is active (schedule_id)", async () => {
    subState.row!.schedule_id = "sub_sched_999";
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result).toEqual({
      success: false,
      error: "予約をキャンセルしてからプラン変更してください",
    });
  });

  it("returns error when cancel_at_period_end is true", async () => {
    subState.row!.cancel_at_period_end = true;
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result).toEqual({
      success: false,
      error: "予約をキャンセルしてからプラン変更してください",
    });
  });

  it("returns error when staff role", async () => {
    authState.userRow = { role: "staff" };
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("担当者");
    }
  });

  it("returns validation errors on downgrade prerequisites failure", async () => {
    subState.row!.plan_type = "corporate";
    validateMock.mockResolvedValueOnce({
      ok: false as const,
      errors: ["掲載中の案件を1件以下にしてください"],
    });
    const result = await changePlanAction({ targetPlan: "individual" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("掲載中の案件");
    }
  });
});

// ---- cancelImmediatelyAction ----

describe("cancelImmediatelyAction", () => {
  it("succeeds when past_due", async () => {
    subState.row!.status = "past_due";
    const result = await cancelImmediatelyAction();
    expect(result.success).toBe(true);
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
  });

  it("rejects when NOT past_due", async () => {
    subState.row!.status = "active";
    const result = await cancelImmediatelyAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("お支払い遅延中の場合のみ");
    }
  });
});

// ---- openCustomerPortalAction ----

describe("openCustomerPortalAction", () => {
  it("returns portal URL when user has stripe_customer_id", async () => {
    adminUserState.stripe_customer_id = "cus_test_1";
    const result = await openCustomerPortalAction();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.portalUrl).toBe(
        "https://billing.stripe.com/test",
      );
    }
  });

  it("returns error when user has no stripe_customer_id", async () => {
    adminUserState.stripe_customer_id = null;
    const result = await openCustomerPortalAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("お支払い情報が登録されていません");
    }
  });
});
