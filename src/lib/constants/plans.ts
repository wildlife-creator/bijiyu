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
  individual: "個人発注者様向けプラン",
  small: "小規模事業主様向けプラン",
  corporate: "法人向けプラン",
  corporate_premium: "法人向けプラン（高サポート）",
};

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

function buildPriceIdMap(): Record<string, PaidPlanType> {
  const entries: Array<[string | undefined, PaidPlanType]> = [
    [process.env.STRIPE_PRICE_INDIVIDUAL, "individual"],
    [process.env.STRIPE_PRICE_SMALL, "small"],
    [process.env.STRIPE_PRICE_CORPORATE, "corporate"],
    [process.env.STRIPE_PRICE_CORPORATE_PREMIUM, "corporate_premium"],
  ];

  const map: Record<string, PaidPlanType> = {};
  for (const [priceId, planType] of entries) {
    if (priceId && priceId.length > 0) {
      map[priceId] = planType;
    }
  }
  return map;
}

/**
 * Resolve a Stripe price ID to a paid plan type.
 *
 * Returns null if the price ID is unknown so callers can record the
 * Webhook as failed (`stripe_webhook_events.status='failed'`).
 *
 * The lookup map is rebuilt on every call so tests can override
 * STRIPE_PRICE_* env vars between cases. The map is small (4 entries)
 * so the cost is negligible.
 */
export function resolvePlanTypeFromPriceId(priceId: string): PaidPlanType | null {
  return buildPriceIdMap()[priceId] ?? null;
}
