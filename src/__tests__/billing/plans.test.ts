import { describe, expect, it, beforeEach } from "vitest";

import { comparePlans } from "@/lib/billing/compare-plans";
import {
  ACTION_TYPES,
  PLAN_LABELS,
  PLAN_LIMITS,
  resolvePlanTypeFromPriceId,
  type PlanType,
} from "@/lib/constants/plans";

const ALL_PLANS: PlanType[] = [
  "free",
  "individual",
  "small",
  "corporate",
  "corporate_premium",
];

describe("PLAN_LIMITS", () => {
  it("rank values are 0..4 in order", () => {
    expect(PLAN_LIMITS.free.rank).toBe(0);
    expect(PLAN_LIMITS.individual.rank).toBe(1);
    expect(PLAN_LIMITS.small.rank).toBe(2);
    expect(PLAN_LIMITS.corporate.rank).toBe(3);
    expect(PLAN_LIMITS.corporate_premium.rank).toBe(4);
  });

  it("free plan blocks job posting and staff", () => {
    expect(PLAN_LIMITS.free.maxOpenJobs).toBe(0);
    expect(PLAN_LIMITS.free.maxStaff).toBe(0);
    expect(PLAN_LIMITS.free.hasProxy).toBe(false);
    expect(PLAN_LIMITS.free.monthlyPriceTaxIncluded).toBe(0);
  });

  it("individual plan allows 1 open job and no staff", () => {
    expect(PLAN_LIMITS.individual.maxOpenJobs).toBe(1);
    expect(PLAN_LIMITS.individual.maxStaff).toBe(0);
    expect(PLAN_LIMITS.individual.hasProxy).toBe(false);
    expect(PLAN_LIMITS.individual.monthlyPriceTaxIncluded).toBe(3800);
  });

  it("small plan allows unlimited jobs and no staff", () => {
    expect(PLAN_LIMITS.small.maxOpenJobs).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_LIMITS.small.maxStaff).toBe(0);
    expect(PLAN_LIMITS.small.hasProxy).toBe(false);
    expect(PLAN_LIMITS.small.monthlyPriceTaxIncluded).toBe(14800);
  });

  it("corporate plan allows unlimited jobs and 10 staff with proxy", () => {
    expect(PLAN_LIMITS.corporate.maxOpenJobs).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_LIMITS.corporate.maxStaff).toBe(10);
    expect(PLAN_LIMITS.corporate.hasProxy).toBe(true);
    expect(PLAN_LIMITS.corporate.monthlyPriceTaxIncluded).toBe(48000);
  });

  it("corporate_premium plan allows 30 staff", () => {
    expect(PLAN_LIMITS.corporate_premium.maxOpenJobs).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(PLAN_LIMITS.corporate_premium.maxStaff).toBe(30);
    expect(PLAN_LIMITS.corporate_premium.hasProxy).toBe(true);
    expect(PLAN_LIMITS.corporate_premium.monthlyPriceTaxIncluded).toBe(148000);
  });
});

describe("PLAN_LABELS", () => {
  it("has Japanese labels for every plan", () => {
    for (const plan of ALL_PLANS) {
      expect(PLAN_LABELS[plan]).toBeTruthy();
      expect(typeof PLAN_LABELS[plan]).toBe("string");
    }
  });
});

describe("ACTION_TYPES", () => {
  it("contains all required audit_log action constants", () => {
    expect(ACTION_TYPES.subscription_created).toBe("subscription_created");
    expect(ACTION_TYPES.subscription_updated).toBe("subscription_updated");
    expect(ACTION_TYPES.subscription_cancelled).toBe("subscription_cancelled");
    expect(ACTION_TYPES.subscription_reservation_cancelled).toBe(
      "subscription_reservation_cancelled",
    );
    expect(ACTION_TYPES.role_changed).toBe("role_changed");
    expect(ACTION_TYPES.auto_cancelled_past_due).toBe("auto_cancelled_past_due");
  });
});

describe("comparePlans", () => {
  // 25 combinations covered exhaustively
  const matrix: Array<[PlanType, PlanType, "upgrade" | "downgrade" | "same"]> = [
    ["free", "free", "same"],
    ["free", "individual", "upgrade"],
    ["free", "small", "upgrade"],
    ["free", "corporate", "upgrade"],
    ["free", "corporate_premium", "upgrade"],

    ["individual", "free", "downgrade"],
    ["individual", "individual", "same"],
    ["individual", "small", "upgrade"],
    ["individual", "corporate", "upgrade"],
    ["individual", "corporate_premium", "upgrade"],

    ["small", "free", "downgrade"],
    ["small", "individual", "downgrade"],
    ["small", "small", "same"],
    ["small", "corporate", "upgrade"],
    ["small", "corporate_premium", "upgrade"],

    ["corporate", "free", "downgrade"],
    ["corporate", "individual", "downgrade"],
    ["corporate", "small", "downgrade"],
    ["corporate", "corporate", "same"],
    ["corporate", "corporate_premium", "upgrade"],

    ["corporate_premium", "free", "downgrade"],
    ["corporate_premium", "individual", "downgrade"],
    ["corporate_premium", "small", "downgrade"],
    ["corporate_premium", "corporate", "downgrade"],
    ["corporate_premium", "corporate_premium", "same"],
  ];

  for (const [current, target, expected] of matrix) {
    it(`${current} → ${target} = ${expected}`, () => {
      expect(comparePlans(current, target)).toBe(expected);
    });
  }
});

describe("resolvePlanTypeFromPriceId", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.STRIPE_PRICE_INDIVIDUAL = "price_test_individual";
    process.env.STRIPE_PRICE_SMALL = "price_test_small";
    process.env.STRIPE_PRICE_CORPORATE = "price_test_corporate";
    process.env.STRIPE_PRICE_CORPORATE_PREMIUM = "price_test_corporate_premium";
  });

  it("resolves known individual price ID", () => {
    expect(resolvePlanTypeFromPriceId("price_test_individual")).toBe("individual");
  });

  it("resolves known small price ID", () => {
    expect(resolvePlanTypeFromPriceId("price_test_small")).toBe("small");
  });

  it("resolves known corporate price ID", () => {
    expect(resolvePlanTypeFromPriceId("price_test_corporate")).toBe("corporate");
  });

  it("resolves known corporate_premium price ID", () => {
    expect(resolvePlanTypeFromPriceId("price_test_corporate_premium")).toBe(
      "corporate_premium",
    );
  });

  it("returns null for unknown price ID", () => {
    expect(resolvePlanTypeFromPriceId("price_unknown_xxx")).toBeNull();
  });

  it("returns null when env var is missing for that plan", () => {
    delete process.env.STRIPE_PRICE_SMALL;
    expect(resolvePlanTypeFromPriceId("price_test_small")).toBeNull();
    // others still work
    expect(resolvePlanTypeFromPriceId("price_test_individual")).toBe("individual");
  });
});
