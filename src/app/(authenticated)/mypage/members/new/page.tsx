import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { MemberForm } from "../member-form";

type OrgRole = "owner" | "admin" | "staff";
type PlanType = "individual" | "small" | "corporate" | "corporate_premium";

export default async function MemberNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 操作者の組織 + ロール
  const { data: actorMember } = await supabase
    .from("organization_members")
    .select("organization_id, org_role, organizations!inner(owner_id)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actorMember) redirect("/mypage");

  const actorRole = actorMember.org_role as OrgRole;

  // Staff は新規作成不可
  if (actorRole === "staff") {
    redirect("/mypage/members");
  }

  // プラン種別取得（法人プランのみ担当者作成可能。個人/小規模では
  // organization が存在しないか maxStaff=0 のため到達しない想定だが念の為ガード）
  const org = Array.isArray(actorMember.organizations)
    ? actorMember.organizations[0]
    : actorMember.organizations;
  const ownerUserId = (org as { owner_id: string } | null)?.owner_id;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_type")
    .eq("user_id", ownerUserId ?? "")
    .in("status", ["active", "past_due"])
    .maybeSingle();

  const planType =
    (subscription?.plan_type as PlanType | undefined) ?? null;
  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";

  if (!isCorporate) {
    redirect("/mypage/members");
  }

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        担当者新規作成
      </h1>
      <div className="mt-6">
        <MemberForm
          mode="create"
          actorRole={actorRole}
          isCorporate={isCorporate}
        />
      </div>
    </div>
  );
}
