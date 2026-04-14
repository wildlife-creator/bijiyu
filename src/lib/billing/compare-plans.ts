import { PLAN_LIMITS, type PlanType } from "@/lib/constants/plans";

export type PlanComparison = "upgrade" | "downgrade" | "same";

/**
 * Compare two plans by rank.
 *
 * Used by:
 * - changePlanAction (Task 6.6) to route between upgrade and downgrade flows
 * - BillingPage (Task 8.1) to decide which CTA label to render
 */
export function comparePlans(
  currentPlan: PlanType,
  targetPlan: PlanType,
): PlanComparison {
  const currentRank = PLAN_LIMITS[currentPlan].rank;
  const targetRank = PLAN_LIMITS[targetPlan].rank;
  if (targetRank > currentRank) return "upgrade";
  if (targetRank < currentRank) return "downgrade";
  return "same";
}
