import { redirect } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { MemberForm } from "../member-form";

type PlanType = "individual" | "small" | "corporate" | "corporate_premium";

export default async function MemberNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 操作者の組織 + ロール
  const { active } = await getActiveOrganizationContext(supabase);

  if (!active) redirect("/mypage");

  const actorRole = active.orgRole;

  // Staff は新規作成不可
  if (actorRole === "staff") {
    redirect("/mypage/members");
  }

  // プラン種別取得（法人プランのみ担当者作成可能。個人/小規模では
  // organization が存在しないか maxStaff=0 のため到達しない想定だが念の為ガード）
  const ownerUserId = active.orgOwnerId;

  // Admin / Staff 自身は RLS で Owner の subscription を見れないため admin client 経由
  const admin = createAdminClient();
  const { data: subscription } = await admin
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
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
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
    </div>
  );
}
