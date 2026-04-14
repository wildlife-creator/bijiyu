import type { SupabaseClient } from "@supabase/supabase-js";

import { PLAN_LIMITS, type PlanType } from "@/lib/constants/plans";
import type { Database } from "@/types/database";

export type DowngradeValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Shared pre-check for downgrade and cancel operations.
 *
 * Verifies:
 *   1. Open jobs count <= target plan's maxOpenJobs
 *   2. No pending (status='applied') applications on the user's jobs
 *   3. Organization staff count (excl. owner) <= target plan's maxStaff
 *
 * For cancellation, pass `targetPlan = 'free'` (maxOpenJobs=0, maxStaff=0).
 */
export async function validateDowngradePrerequisites(
  admin: SupabaseClient<Database>,
  userId: string,
  currentPlan: PlanType,
  targetPlan: PlanType,
): Promise<DowngradeValidationResult> {
  const targetLimits = PLAN_LIMITS[targetPlan];
  const errors: string[] = [];

  // 1. Open jobs count
  const { count: openJobsCount } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "open");

  const currentOpenJobs = openJobsCount ?? 0;
  if (targetLimits.maxOpenJobs !== Number.POSITIVE_INFINITY && currentOpenJobs > targetLimits.maxOpenJobs) {
    errors.push(
      `掲載中の案件を${targetLimits.maxOpenJobs}件以下にしてからプラン変更してください（現在${currentOpenJobs}件）`,
    );
  }

  // 2. Pending applications on the user's jobs
  const { count: pendingAppsCount } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "applied")
    .in(
      "job_id",
      // sub-select: jobs owned by the user
      (
        await admin
          .from("jobs")
          .select("id")
          .eq("owner_id", userId)
      ).data?.map((j) => j.id) ?? [],
    );

  if ((pendingAppsCount ?? 0) > 0) {
    errors.push(
      "未対応の応募があります。すべて対応してからプラン変更してください",
    );
  }

  // 3. Organization staff count (includes proxy accounts, excludes owner)
  const { data: orgData } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (orgData) {
    const { count: staffCount } = await admin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgData.id)
      .neq("org_role", "owner");

    const currentStaff = staffCount ?? 0;
    if (currentStaff > targetLimits.maxStaff) {
      errors.push(
        `担当者を${targetLimits.maxStaff}人以下にしてからプラン変更してください（現在${currentStaff}人）`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
