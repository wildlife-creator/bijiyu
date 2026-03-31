/**
 * Determine whether a user can apply for a given job.
 *
 * Paid users (subscriptions.status IN ('active','past_due') or staff role)
 * can always apply. Free users may only apply when the job's trade type
 * matches one of their registered skills AND the job's prefecture matches
 * one of their available areas.
 *
 * This logic mirrors the DB helper `is_paid_user()` so that both the
 * frontend (CON-003) and Server Action (applyJobAction) share the same
 * rules.
 */

export interface CanApplyJobParams {
  userRole: "contractor" | "client" | "staff";
  isPaidUser: boolean; // subscriptions.status IN ('active', 'past_due')
  jobTradeType: string;
  jobPrefecture: string;
  userSkills: Array<{ tradeType: string }>;
  userAvailableAreas: Array<{ prefecture: string }>;
}

export interface CanApplyJobResult {
  canApply: boolean;
  reason?: string;
}

export function canApplyJob(params: CanApplyJobParams): CanApplyJobResult {
  // Paid users and staff can always apply
  if (params.isPaidUser) {
    return { canApply: true };
  }

  // Free user: check trade type match
  const hasMatchingSkill = params.userSkills.some(
    (s) => s.tradeType === params.jobTradeType,
  );
  // Free user: check prefecture match
  const hasMatchingArea = params.userAvailableAreas.some(
    (a) => a.prefecture === params.jobPrefecture,
  );

  if (hasMatchingSkill && hasMatchingArea) {
    return { canApply: true };
  }

  return {
    canApply: false,
    reason:
      "有料プランに加入するか、プロフィールの職種・エリアを更新してください",
  };
}
