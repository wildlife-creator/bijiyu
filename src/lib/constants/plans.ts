/**
 * billing plan constants and helpers.
 *
 * - PLAN_LIMITS: per-plan limits and pricing (used by CLI-026, validation, mail)
 * - PLAN_LABELS: display labels (used by CLI-026 and mail templates)
 * - ACTION_TYPES: audit_logs.action values used by billing flows
 * - PRICE_ID_TO_PLAN_TYPE / resolvePlanTypeFromPriceId: Stripe price ID lookup
 *
 * Money is stored as integer JPY (税込).
 */

// ---------------------------------------------------------------------------
// Plan limits and pricing
// ---------------------------------------------------------------------------

export const PLAN_LIMITS = {
  free: {
    rank: 0,
    maxOpenJobs: 0,
    maxStaff: 0,
    hasProxy: false,
    monthlyPriceTaxIncluded: 0,
  },
  individual: {
    rank: 1,
    maxOpenJobs: 1,
    maxStaff: 0,
    hasProxy: false,
    monthlyPriceTaxIncluded: 3800,
  },
  small: {
    rank: 2,
    maxOpenJobs: Number.POSITIVE_INFINITY,
    maxStaff: 0,
    hasProxy: false,
    monthlyPriceTaxIncluded: 14800,
  },
  corporate: {
    rank: 3,
    maxOpenJobs: Number.POSITIVE_INFINITY,
    maxStaff: 10,
    hasProxy: true,
    monthlyPriceTaxIncluded: 48000,
  },
  corporate_premium: {
    rank: 4,
    maxOpenJobs: Number.POSITIVE_INFINITY,
    maxStaff: 30,
    hasProxy: true,
    monthlyPriceTaxIncluded: 148000,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

/** All paid plan types (excludes 'free'). */
export const PAID_PLAN_TYPES = [
  "individual",
  "small",
  "corporate",
  "corporate_premium",
] as const satisfies readonly Exclude<PlanType, "free">[];

export type PaidPlanType = (typeof PAID_PLAN_TYPES)[number];

// ---------------------------------------------------------------------------
// Display labels (Japanese)
// ---------------------------------------------------------------------------

export const PLAN_LABELS: Record<PlanType, string> = {
  free: "無料プラン",
  individual: "ライトプラン",
  small: "スタンダードプラン",
  corporate: "プレミアムプラン",
  corporate_premium: "ハイエンドプラン",
};

// ---------------------------------------------------------------------------
// 支払方法 / 支払サイクル（銀行振込 P2: docs/requirements/spec-changes-202608.md §2.1）
// ---------------------------------------------------------------------------

export type PaymentMethod = "stripe" | "bank_transfer";
export type BillingCycle = "monthly" | "yearly";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "クレジットカード",
  bank_transfer: "銀行振込",
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "月払い",
  yearly: "年払い",
};

/**
 * 初回事務手数料（税込 JPY）。基本プランへ初めて申し込むときのみ。
 * Stripe 経路は STRIPE_PRICE_INITIAL_FEE（¥20,000）の Price を line item に足す。
 * 銀行振込経路はこの定数で申込金額を組み立てる。金額は両者で一致させること。
 */
export const INITIAL_FEE_TAX_INCLUDED = 20000;

/**
 * 年払いの料金（税込 JPY）。
 *
 * TODO(P3-yearly-price): 年払い金額はクライアント未確定のため「月額 × 12」を暫定値とする。
 * P3 で Stripe の年額 Price を作成する際に正式金額へ差し替え、Stripe 側と一致させること。
 * PLAN_LIMITS（月額）は変更しない。
 */
export const YEARLY_PRICE_TAX_INCLUDED: Record<PaidPlanType, number> = {
  individual: PLAN_LIMITS.individual.monthlyPriceTaxIncluded * 12,
  small: PLAN_LIMITS.small.monthlyPriceTaxIncluded * 12,
  corporate: PLAN_LIMITS.corporate.monthlyPriceTaxIncluded * 12,
  corporate_premium: PLAN_LIMITS.corporate_premium.monthlyPriceTaxIncluded * 12,
};

/** プラン本体の料金（税込 JPY）を支払サイクルで解決する。 */
export function planPriceFor(planType: PaidPlanType, cycle: BillingCycle): number {
  return cycle === "yearly"
    ? YEARLY_PRICE_TAX_INCLUDED[planType]
    : PLAN_LIMITS[planType].monthlyPriceTaxIncluded;
}

/**
 * 表示名「プラン名（月払い / 年払い）」。メール本文・予約表示・管理画面で共用する。
 * サイクル未指定（null / undefined）はプラン名のみ（旧データ・無料プラン向け）。
 */
export function planDisplayName(
  planType: PlanType,
  cycle?: BillingCycle | null,
): string {
  const base = PLAN_LABELS[planType];
  if (!cycle || planType === "free") return base;
  return `${base}（${BILLING_CYCLE_LABELS[cycle]}）`;
}

/** Stripe Price ID を返す環境変数名（月額 4 + 年額 4、P3 で年額を追加）。 */
export const STRIPE_PRICE_ENV_KEYS: Record<PaidPlanType, Record<BillingCycle, string>> = {
  individual: {
    monthly: "STRIPE_PRICE_INDIVIDUAL",
    yearly: "STRIPE_PRICE_INDIVIDUAL_YEARLY",
  },
  small: { monthly: "STRIPE_PRICE_SMALL", yearly: "STRIPE_PRICE_SMALL_YEARLY" },
  corporate: {
    monthly: "STRIPE_PRICE_CORPORATE",
    yearly: "STRIPE_PRICE_CORPORATE_YEARLY",
  },
  corporate_premium: {
    monthly: "STRIPE_PRICE_CORPORATE_PREMIUM",
    yearly: "STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY",
  },
};

/** （プラン, サイクル）→ Stripe Price ID。未設定なら null。 */
export function priceIdFor(planType: PaidPlanType, cycle: BillingCycle): string | null {
  const value = process.env[STRIPE_PRICE_ENV_KEYS[planType][cycle]];
  return value && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// audit_logs.action constants
// ---------------------------------------------------------------------------
//
// DB column name is `action` (not `action_type`).
// Use these constants when inserting audit_log rows so values stay in sync.

export const ACTION_TYPES = {
  subscription_created: "subscription_created",
  subscription_updated: "subscription_updated",
  subscription_cancelled: "subscription_cancelled",
  subscription_reservation_cancelled: "subscription_reservation_cancelled",
  role_changed: "role_changed",
  auto_cancelled_past_due: "auto_cancelled_past_due",
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];

// ---------------------------------------------------------------------------
// Stripe price ID → plan_type reverse map
// ---------------------------------------------------------------------------
//
// We lazily build the map so missing env vars during tests / build don't blow
// up module evaluation. Tests can override env vars (e.g. via vi.stubEnv) and
// re-call resolvePlanTypeFromPriceId() to verify lookups.

export interface PlanPrice {
  planType: PaidPlanType;
  billingCycle: BillingCycle;
}

function buildPriceIdMap(): Record<string, PlanPrice> {
  const map: Record<string, PlanPrice> = {};
  for (const planType of PAID_PLAN_TYPES) {
    for (const billingCycle of ["monthly", "yearly"] as const) {
      const priceId = process.env[STRIPE_PRICE_ENV_KEYS[planType][billingCycle]];
      if (priceId && priceId.length > 0) {
        map[priceId] = { planType, billingCycle };
      }
    }
  }
  return map;
}

/**
 * Resolve a Stripe price ID to (plan type, billing cycle).
 *
 * Returns null if the price ID is unknown so callers can record the
 * Webhook as failed (`stripe_webhook_events.status='failed'`).
 *
 * The lookup map is rebuilt on every call so tests can override
 * STRIPE_PRICE_* env vars between cases. The map is small (8 entries)
 * so the cost is negligible.
 */
export function resolvePlanPriceFromId(priceId: string): PlanPrice | null {
  return buildPriceIdMap()[priceId] ?? null;
}

/** 後方互換: Price ID → plan type のみ（サイクル不要な呼出向け）。 */
export function resolvePlanTypeFromPriceId(priceId: string): PaidPlanType | null {
  return resolvePlanPriceFromId(priceId)?.planType ?? null;
}
