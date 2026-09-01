import { describe, expect, it, beforeEach } from "vitest";

import { comparePlans } from "@/lib/billing/compare-plans";
import {
  ACTION_TYPES,
  PLAN_LABELS,
  PLAN_LIMITS,
  planDisplayName,
  planPriceFor,
  priceIdFor,
  resolvePlanPriceFromId,
  resolvePlanTypeFromPriceId,
  YEARLY_PRICE_TAX_INCLUDED,
  type PlanType,
} from "@/lib/constants/plans";
import { comparePlanChange } from "@/lib/billing/compare-plans";

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

  it("2026-08 仕様変更のプラン名（ライト/スタンダード/プレミアム/ハイエンド）を返す", () => {
    expect(PLAN_LABELS.free).toBe("無料プラン");
    expect(PLAN_LABELS.individual).toBe("ライトプラン");
    expect(PLAN_LABELS.small).toBe("スタンダードプラン");
    expect(PLAN_LABELS.corporate).toBe("プレミアムプラン");
    expect(PLAN_LABELS.corporate_premium).toBe("ハイエンドプラン");
  });

  it("旧プラン名（個人発注者様向け / 小規模事業主様向け / 法人向け）を含まない", () => {
    for (const plan of ALL_PLANS) {
      expect(PLAN_LABELS[plan]).not.toMatch(/個人発注者|小規模事業主|法人向け|高サポート/);
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
    process.env.STRIPE_PRICE_INDIVIDUAL_YEARLY = "price_test_individual_yearly";
    process.env.STRIPE_PRICE_SMALL_YEARLY = "price_test_small_yearly";
    process.env.STRIPE_PRICE_CORPORATE_YEARLY = "price_test_corporate_yearly";
    process.env.STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY = "price_test_corporate_premium_yearly";
  });

  it("P3: 年額 Price ID は (plan, yearly) に解決される。月額は monthly", () => {
    expect(resolvePlanPriceFromId("price_test_small_yearly")).toEqual({
      planType: "small",
      billingCycle: "yearly",
    });
    expect(resolvePlanPriceFromId("price_test_small")).toEqual({
      planType: "small",
      billingCycle: "monthly",
    });
    expect(resolvePlanTypeFromPriceId("price_test_corporate_premium_yearly")).toBe("corporate_premium");
    expect(resolvePlanPriceFromId("price_unknown")).toBeNull();
  });

  it("P3: priceIdFor は (plan, cycle) → 環境変数の Price ID。未設定は null", () => {
    expect(priceIdFor("corporate", "monthly")).toBe("price_test_corporate");
    expect(priceIdFor("corporate", "yearly")).toBe("price_test_corporate_yearly");
    delete process.env.STRIPE_PRICE_CORPORATE_YEARLY;
    expect(priceIdFor("corporate", "yearly")).toBeNull();
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

describe("P3: 年払いの料金・表示名・比較", () => {
  it("planPriceFor: 月払いは PLAN_LIMITS、年払いは YEARLY_PRICE_TAX_INCLUDED（暫定 月額×12）", () => {
    expect(planPriceFor("individual", "monthly")).toBe(3800);
    expect(planPriceFor("individual", "yearly")).toBe(YEARLY_PRICE_TAX_INCLUDED.individual);
    expect(YEARLY_PRICE_TAX_INCLUDED.individual).toBe(3800 * 12);
    expect(YEARLY_PRICE_TAX_INCLUDED.corporate_premium).toBe(148000 * 12);
  });

  it("planDisplayName: 「プラン名（月払い/年払い）」。サイクル未指定・無料はプラン名のみ", () => {
    expect(planDisplayName("small", "monthly")).toBe("スタンダードプラン（月払い）");
    expect(planDisplayName("small", "yearly")).toBe("スタンダードプラン（年払い）");
    expect(planDisplayName("small")).toBe("スタンダードプラン");
    expect(planDisplayName("free", "monthly")).toBe("無料プラン");
  });

  it("comparePlanChange: プランのランクが優先。同一プランでは 月→年 = upgrade、年→月 = downgrade", () => {
    expect(
      comparePlanChange(
        { planType: "individual", billingCycle: "yearly" },
        { planType: "small", billingCycle: "monthly" },
      ),
    ).toBe("upgrade");
    expect(
      comparePlanChange(
        { planType: "corporate", billingCycle: "monthly" },
        { planType: "small", billingCycle: "yearly" },
      ),
    ).toBe("downgrade");
    expect(
      comparePlanChange(
        { planType: "small", billingCycle: "monthly" },
        { planType: "small", billingCycle: "yearly" },
      ),
    ).toBe("upgrade");
    expect(
      comparePlanChange(
        { planType: "small", billingCycle: "yearly" },
        { planType: "small", billingCycle: "monthly" },
      ),
    ).toBe("downgrade");
    expect(
      comparePlanChange(
        { planType: "small", billingCycle: "yearly" },
        { planType: "small", billingCycle: "yearly" },
      ),
    ).toBe("same");
  });
});
