import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fetch open jobs (org jobs or own jobs)
  let jobsQuery = supabase
    .from("jobs")
    .select("id, title")
    .eq("status", "open")
    .is("deleted_at", null);

  if (orgMember) {
    jobsQuery = jobsQuery.eq("organization_id", orgMember.organization_id);
  } else {
    jobsQuery = jobsQuery.eq("owner_id", user.id);
  }

  const { data: jobsData } = await jobsQuery.order("created_at", {
    ascending: false,
  });

  // Fetch scout templates（最終更新日降順。CLI-018 編集直後に上位に来る）
  const { data: templatesData } = await supabase
    .from("scout_templates")
    .select("id, title, body")
    .order("updated_at", { ascending: false });

  return (
    <ScoutSendForm
      targetUserId={targetUserId}
      userProfile={userProfile}
      jobs={jobsData ?? []}
      templates={templatesData ?? []}
    />
  );
}
