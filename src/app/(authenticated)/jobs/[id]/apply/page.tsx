import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canApplyJob } from "@/lib/utils/can-apply-job";
import { resolveParticipantName } from "@/lib/utils/display-name";
import { getActiveCorporateOrgNames } from "@/lib/utils/resolve-org-names";
import { ApplicationForm } from "./application-form";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scout_message_id?: string }>;
}

export default async function ApplicationPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { scout_message_id: scoutMessageId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch job summary
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, trade_type, prefecture, reward_lower, reward_upper, work_hours, owner_id, users!jobs_owner_id_fkey(company_name, last_name, first_name, deleted_at)",
    )
    .eq("id", id)
    .eq("status", "open")
    .is("deleted_at", null)
    .single();

  if (!job) {
    notFound();
  }

  // Application eligibility check (prevent direct URL access)
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  const isPaidUser = !!subscription || userData?.role === "staff" || userData?.role === "client";

  if (!isPaidUser) {
    const { data: skills } = await supabase
      .from("user_skills")
      .select("trade_type")
      .eq("user_id", user.id);

    const { data: areas } = await supabase
      .from("user_available_areas")
      .select("prefecture")
      .eq("user_id", user.id);

    const applyCheck = canApplyJob({
      userRole: (userData?.role as "contractor" | "client" | "staff") ?? "contractor",
      isPaidUser: false,
      jobTradeType: job.trade_type ?? "",
      jobPrefecture: job.prefecture ?? "",
      userSkills: (skills ?? []).map((s) => ({ tradeType: s.trade_type })),
      userAvailableAreas: (areas ?? []).map((a) => ({ prefecture: a.prefecture })),
    });

    if (!applyCheck.canApply) {
      redirect(`/jobs/${id}`);
    }
  }

  // 法人プラン（active）の場合のみ組織名を使う
  const admin = createAdminClient();
  const ownerOrgNameMap = await getActiveCorporateOrgNames(admin, [job.owner_id]);
  const ownerOrgName = ownerOrgNameMap.get(job.owner_id) ?? null;
  const ownerUser = job.users as unknown as {
    company_name: string | null;
    last_name: string | null;
    first_name: string | null;
    deleted_at: string | null;
  } | null;
  const companyName = ownerUser
    ? resolveParticipantName({
        organizationName: ownerOrgName,
        companyName: ownerUser.company_name,
        lastName: ownerUser.last_name,
        firstName: ownerUser.first_name,
        deletedAt: ownerUser.deleted_at,
      })
    : null;

  return (
    <div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">応募情報入力</h1>

      {/* Job summary */}
      <div className="mt-4 rounded-[8px] border border-border p-4 space-y-1">
        <h2 className="text-body-lg font-semibold">{job.title}</h2>
        {companyName && (
          <p className="text-body-sm text-muted-foreground">{companyName}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
          {job.reward_lower && job.reward_upper && (
            <span>
              {job.reward_lower.toLocaleString()}〜
              {job.reward_upper.toLocaleString()}円（人工）
            </span>
          )}
          {job.prefecture && <span>{job.prefecture}</span>}
          {job.work_hours && <span>{job.work_hours}</span>}
        </div>
      </div>

      {/* Application form */}
      <ApplicationForm jobId={id} scoutMessageId={scoutMessageId} />
    </div>
  );
}
