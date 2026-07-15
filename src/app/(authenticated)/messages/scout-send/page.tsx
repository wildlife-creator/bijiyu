import { redirect, notFound } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { ScoutSendForm } from "./scout-send-form";

interface PageProps {
  searchParams: Promise<{ userId?: string }>;
}

export default async function ScoutSendPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const targetUserId = params.userId;
  if (!targetUserId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch target user profile
  const { data: targetUser } = await supabase
    .from("users")
    .select(
      "id, last_name, first_name, avatar_url, birth_date, identity_verified, ccus_verified",
    )
    .eq("id", targetUserId)
    .single();

  if (!targetUser) notFound();

  // Fetch target user's skills
  const { data: skills } = await supabase
    .from("user_skills")
    .select("trade_type, experience_years")
    .eq("user_id", targetUserId);

  const age = targetUser.birth_date ? calculateAge(targetUser.birth_date) : null;

  const userProfile = {
    id: targetUser.id,
    lastName: targetUser.last_name || "",
    firstName: targetUser.first_name || "",
    avatarUrl: targetUser.avatar_url,
    age,
    identityVerified: targetUser.identity_verified ?? false,
    ccusVerified: targetUser.ccus_verified ?? false,
    skills: (skills ?? []).map((s) => s.trade_type),
    experienceYears: skills?.[0]?.experience_years ?? null,
  };

  // Check if user is in an organization
  const { active } = await getActiveOrganizationContext(supabase);

  // Fetch open jobs (org jobs or own jobs)
  let jobsQuery = supabase
    .from("jobs")
    .select("id, title")
    .eq("status", "open")
    .is("deleted_at", null);

  if (active) {
    jobsQuery = jobsQuery.eq("organization_id", active.organizationId);
  } else {
    jobsQuery = jobsQuery.eq("owner_id", user.id);
  }

  const { data: jobsData } = await jobsQuery.order("created_at", {
    ascending: false,
  });

  // 修正1: 対象職人が既に応募済みの案件は選択不可にする（全ステータス対象）。
  // job owner の RLS に依存しないよう admin client で照会する。
  const jobIds = (jobsData ?? []).map((j) => j.id);
  let appliedJobIds: string[] = [];
  if (jobIds.length > 0) {
    const admin = createAdminClient();
    const { data: appliedRows, error: appliedRowsError } = await admin
      .from("applications")
      .select("job_id")
      .eq("applicant_id", targetUserId)
      .in("job_id", jobIds);
    // 照会失敗はログに残す（最終防衛線は sendScoutAction 側の応募済みチェック）。
    if (appliedRowsError) {
      console.error(
        "[ScoutSendPage] applied jobs lookup failed:",
        appliedRowsError,
      );
    }
    appliedJobIds = Array.from(
      new Set((appliedRows ?? []).map((a) => a.job_id)),
    );
  }

  // Fetch scout templates（最終更新日降順。CLI-018 編集直後に上位に来る）
  // 案件と同じくアクティブ組織（法人でなければ本人分）に絞る。RLS 任せだと
  // 複数組織所属の代理スタッフに他組織のテンプレが混ざる
  let templatesQuery = supabase
    .from("scout_templates")
    .select("id, title, body");

  templatesQuery = active
    ? templatesQuery.eq("organization_id", active.organizationId)
    : templatesQuery.eq("owner_id", user.id);

  const { data: templatesData } = await templatesQuery.order("updated_at", {
    ascending: false,
  });

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <ScoutSendForm
          targetUserId={targetUserId}
          userProfile={userProfile}
          jobs={jobsData ?? []}
          templates={templatesData ?? []}
          appliedJobIds={appliedJobIds}
        />
      </div>
    </div>
  );
}
