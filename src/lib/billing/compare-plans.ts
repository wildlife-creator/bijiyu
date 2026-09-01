import { PLAN_LIMITS, type BillingCycle, type PlanType } from "@/lib/constants/plans";

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

/**
 * プランと支払サイクルの両方を見た変更の向き（P3 年払い）。
 *
 * 1. プランのランクが違えばそれが優先（上位へ = upgrade、下位へ = downgrade）
 * 2. 同じプランなら 月払い → 年払い = upgrade（即時切替）、年払い → 月払い = downgrade（期末切替）
 * 3. どちらも同じなら same
 *
 * 仕様: docs/requirements/spec-changes-202608.md §2.1(2) サイクル切替ルール
 */
export function comparePlanChange(
  current: { planType: PlanType; billingCycle: BillingCycle },
  target: { planType: PlanType; billingCycle: BillingCycle },
): PlanComparison {
  const byPlan = comparePlans(current.planType, target.planType);
  if (byPlan !== "same") return byPlan;
  if (current.billingCycle === target.billingCycle) return "same";
  return target.billingCycle === "yearly" ? "upgrade" : "downgrade";
}
