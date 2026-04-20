import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientProfileFormInput } from "@/lib/validations/client-profile";

import { ClientProfileEditForm } from "./client-profile-edit-form";

interface PageProps {
  searchParams: Promise<{ setup?: string }>;
}

type PlanType = "individual" | "small" | "corporate" | "corporate_premium";

async function resolveProfileUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorUserId: string,
): Promise<string> {
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, org_role, organizations!inner(owner_id)")
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (!member) return actorUserId;
  if (member.org_role === "owner") return actorUserId;

  const org = Array.isArray(member.organizations)
    ? member.organizations[0]
    : member.organizations;
  return (org as { owner_id: string } | null)?.owner_id ?? actorUserId;
}

export default async function ClientProfileEditPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const isSetup = sp.setup === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profileUserId = await resolveProfileUserId(supabase, user.id);

  // Admin が Owner の profile を編集するケースで、Admin は RLS により
  // Owner subscription を見られないため admin client 経由で取得
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("plan_type, status")
    .eq("user_id", profileUserId)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  const planType =
    (subscription?.plan_type as PlanType | undefined) ?? null;

  // setup モードでプランが未確定の場合も画面表示は許可（要件書 L207）
  const { data: profile } = await supabase
    .from("client_profiles")
    .select(
      `display_name, address, image_url, recruit_job_types, recruit_area,
       employee_scale, working_way, language, message,
       sns_x, sns_instagram, sns_tiktok, sns_youtube, sns_facebook`,
    )
    .eq("user_id", profileUserId)
    .maybeSingle();

  // Webhook によるデフォルト値（姓名）のフォールバック
  const { data: ownerUser } = await supabase
    .from("users")
    .select("last_name, first_name")
    .eq("id", profileUserId)
    .maybeSingle();

  const initialValues: ClientProfileFormInput = {
    displayName:
      profile?.display_name ??
      (ownerUser
        ? `${ownerUser.last_name ?? ""}${ownerUser.first_name ?? ""}` || null
        : null),
    address: profile?.address ?? null,
    imageUrl: profile?.image_url ?? null,
    recruitJobTypes: profile?.recruit_job_types ?? [],
    recruitArea: profile?.recruit_area ?? [],
    employeeScale: profile?.employee_scale ?? null,
    workingWay: profile?.working_way ?? null,
    language: profile?.language ?? null,
    message: profile?.message ?? null,
    snsX: profile?.sns_x ?? false,
    snsInstagram: profile?.sns_instagram ?? false,
    snsTiktok: profile?.sns_tiktok ?? false,
    snsYoutube: profile?.sns_youtube ?? false,
    snsFacebook: profile?.sns_facebook ?? false,
  };

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者情報編集
      </h1>
      <div className="mt-6">
        <ClientProfileEditForm
          planType={planType}
          initialValues={initialValues}
          mode={isSetup ? "setup" : "edit"}
        />
      </div>
    </div>
  );
}
