import { redirect, notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canSendJobInquiry } from "@/lib/job-inquiry/access-guard";
import {
  resolveTargetOrganizationId,
  resolveViewerOrganizationId,
} from "@/lib/job-inquiry/resolve-context";
import { resolveParticipantName } from "@/lib/utils/display-name";
import { InquiryForm } from "./inquiry-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

// COM-013 求人へのお問い合わせフォーム（ログイン必須・/clients/[id]/inquiry）
export default async function JobInquiryPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware で認証必須だが念のため
  if (!user) {
    redirect("/login");
  }

  // 宛先発注者を取得（公開 SELECT）
  const { data: target } = await supabase
    .from("users")
    .select(
      `id, role, deleted_at, last_name, first_name,
       client_profiles(display_name)`,
    )
    .eq("id", id)
    .eq("role", "client")
    .maybeSingle();

  if (!target) {
    notFound();
  }

  // viewer / target の所属組織を解決し、UI と同じ純粋関数でガード判定する
  const admin = createAdminClient();
  const { data: viewerData } = await supabase
    .from("users")
    .select("role, last_name, first_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const [viewerOrgId, targetOrgId] = await Promise.all([
    resolveViewerOrganizationId(admin, user.id),
    resolveTargetOrganizationId(admin, target.id),
  ]);

  const guard = canSendJobInquiry({
    viewer: {
      id: user.id,
      role: viewerData?.role ?? null,
      organizationId: viewerOrgId,
    },
    target: {
      id: target.id,
      deletedAt: target.deleted_at,
      organizationId: targetOrgId,
    },
  });
  // 自分宛 / 自社宛 / 退会済み宛 / admin はフォーム到達自体を遮断する
  if (!guard.ok) {
    redirect(`/clients/${id}`);
  }

  const profile = Array.isArray(target.client_profiles)
    ? target.client_profiles[0]
    : target.client_profiles;
  const targetDisplayName = resolveParticipantName({
    displayName: profile?.display_name ?? null,
    lastName: target.last_name,
    firstName: target.first_name,
    deletedAt: target.deleted_at,
  });

  const defaultName =
    viewerData?.last_name && viewerData?.first_name
      ? `${viewerData.last_name}${viewerData.first_name}`
      : "";
  const defaultEmail = viewerData?.email ?? user.email ?? "";

  return (
    <div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <InquiryForm
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        targetClientId={id}
        targetDisplayName={targetDisplayName}
      />
    </div>
  );
}
