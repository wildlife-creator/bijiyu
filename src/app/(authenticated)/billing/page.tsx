import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_LABELS, PLAN_LIMITS, type PlanType, type PaidPlanType, PAID_PLAN_TYPES } from "@/lib/constants/plans";
import { comparePlans } from "@/lib/billing/compare-plans";
import { FEE_COOKIE_NAME, readFeeCookie } from "@/lib/billing/fee-cookie";
import { cookies } from "next/headers";

import { BillingClient } from "./BillingClient";

/**
 * CLI-026: プラン案内画面（Server Component）
 *
 * デザインカンプ: CLI-026.png (初回申込), CLI-026-b.png (プラン変更)
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Single query for user + subscription + options + client_profiles
  const admin = createAdminClient();

  const [userResult, subResult, optionResult, profileResult] = await Promise.all([
    admin.from("users").select("id, role, email, last_name, first_name").eq("id", user.id).single(),
    admin.from("subscriptions")
      .select("id, plan_type, status, schedule_id, scheduled_plan_type, scheduled_at, cancel_at_period_end, current_period_end, stripe_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("option_subscriptions")
      .select("id, option_type, status, job_id, stripe_subscription_id, end_date")
      .eq("user_id", user.id)
      .eq("status", "active"),
    admin.from("client_profiles")
      .select("is_urgent_option, is_compensation_5000, is_compensation_9800")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const userData = userResult.data;
  if (!userData) redirect("/login");

  const subscription = subResult.data;
  const activeOptions = optionResult.data ?? [];
  const clientProfile = profileResult.data;

  const isStaff = userData.role === "staff";
  const isPastDue = subscription?.status === "past_due";
  const hasReservation = !!(subscription?.schedule_id || subscription?.cancel_at_period_end);

  const currentPlan: PlanType = subscription ? (subscription.plan_type as PlanType) : "free";
  const isFirstPurchase = !subscription;

  // Fee=free cookie check
  const cookieStore = await cookies();
  const feeCookie = await readFeeCookie(cookieStore.get(FEE_COOKIE_NAME)?.value).catch(() => null);
  const hasFeeExemption = feeCookie?.feeExempt === true;
  const showInitialFee = isFirstPurchase && !hasFeeExemption;

  // Determine button states for each plan
  const planStates = PAID_PLAN_TYPES.map((planType) => {
    const isCurrent = currentPlan === planType;
    const comparison = comparePlans(currentPlan, planType);

    let buttonLabel: string;
    let buttonDisabled: boolean;
    let buttonAction: "checkout" | "change" | "none";
    let disabledReason: string | null = null;

    if (isStaff) {
      buttonLabel = "申し込む";
      buttonDisabled = true;
      buttonAction = "none";
      disabledReason = null;
    } else if (isCurrent) {
      buttonLabel = "ご利用中";
      buttonDisabled = true;
      buttonAction = "none";
    } else if (isPastDue) {
      buttonLabel = comparison === "upgrade" ? "このプランに変更する" : "このプランに変更する";
      buttonDisabled = true;
      buttonAction = "none";
      disabledReason = "お支払い確認中のため変更できません";
    } else if (hasReservation) {
      buttonLabel = "このプランに変更する";
      buttonDisabled = true;
      buttonAction = "none";
      disabledReason = "予約をキャンセルしてから操作してください";
    } else if (isFirstPurchase || (!subscription)) {
      buttonLabel = "申し込む";
      buttonDisabled = false;
      buttonAction = "checkout";
    } else {
      buttonLabel = "このプランに変更する";
      buttonDisabled = false;
      buttonAction = "change";
    }

    return {
      planType,
      label: PLAN_LABELS[planType],
      price: PLAN_LIMITS[planType].monthlyPriceTaxIncluded,
      isCurrent,
      isPastDue: isCurrent && isPastDue,
      buttonLabel,
      buttonDisabled,
      buttonAction,
      disabledReason,
    };
  });

  // Jobs eligible for urgent option dropdown
  // - 法人プラン（組織所属）: 組織全体の案件
  // - 個人プラン: 自分がオーナーの案件のみ
  const { data: orgMember } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let jobsQuery = admin
    .from("jobs")
    .select("id, title, is_urgent")
    .eq("status", "open");

  if (orgMember) {
    jobsQuery = jobsQuery.eq("organization_id", orgMember.organization_id);
  } else {
    jobsQuery = jobsQuery.eq("owner_id", user.id);
  }

  const { data: ownedJobs } = await jobsQuery;

  // Filter jobs eligible for urgent option
  const urgentEligibleJobs = (ownedJobs ?? []).filter((j) => {
    if (j.is_urgent) return false;
    return !activeOptions.some(
      (o) => o.option_type === "urgent" && o.job_id === j.id,
    );
  });

  const sp = await searchParams;

  return (
    <BillingClient
      userId={user.id}
      isStaff={isStaff}
      isPastDue={isPastDue}
      hasReservation={hasReservation}
      currentPlan={currentPlan}
      isFirstPurchase={isFirstPurchase}
      subscription={subscription ? {
        scheduleId: subscription.schedule_id,
        scheduledPlanType: subscription.scheduled_plan_type,
        scheduledAt: subscription.scheduled_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end,
        stripeSubscriptionId: subscription.stripe_subscription_id,
      } : null}
      planStates={planStates}
      showInitialFee={showInitialFee}
      activeOptions={activeOptions.map((o) => ({
        id: o.id,
        optionType: o.option_type,
        jobId: o.job_id,
        stripeSubscriptionId: o.stripe_subscription_id,
        endDate: o.end_date,
      }))}
      clientProfile={{
        isUrgentOption: clientProfile?.is_urgent_option ?? false,
        isCompensation5000: clientProfile?.is_compensation_5000 ?? false,
        isCompensation9800: clientProfile?.is_compensation_9800 ?? false,
      }}
      urgentEligibleJobs={urgentEligibleJobs.map((j) => ({ id: j.id, title: j.title }))}
      checkoutSuccess={sp.checkout === "success" ? "plan" : sp.option_success as string | undefined}
    />
  );
}
