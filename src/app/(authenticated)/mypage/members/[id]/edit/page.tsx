import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { MemberForm } from "../../member-form";

type OrgRole = "owner" | "admin" | "staff";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MemberEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 操作者の組織 + ロール
  const { data: actorMember } = await supabase
    .from("organization_members")
    .select("organization_id, org_role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actorMember) redirect("/mypage");

  const actorRole = actorMember.org_role as OrgRole;

  // Owner が自分の ID を開いた場合は /profile/edit にリダイレクト
  if (id === user.id && actorRole === "owner") {
    redirect("/profile/edit");
  }

  // 対象メンバー取得
  const { data: targetRow } = await supabase
    .from("organization_members")
    .select(
      `org_role, is_proxy_account,
       user:users!user_id(id, last_name, first_name, email)`,
    )
    .eq("organization_id", actorMember.organization_id)
    .eq("user_id", id)
    .maybeSingle();

  type TargetRow = {
    org_role: OrgRole;
    is_proxy_account: boolean;
    user: {
      id: string;
      last_name: string | null;
      first_name: string | null;
      email: string;
    } | null;
  };
  const target = targetRow as unknown as TargetRow | null;

  if (!target || !target.user) notFound();

  const targetRole = target.org_role;
  const isSelfEdit = id === user.id;

  // 権限チェック: 自己編集 または owner / admin による下位編集
  if (!isSelfEdit) {
    if (actorRole === "staff") {
      redirect(`/mypage/members/${id}`);
    }
    if (targetRole === "owner") {
      redirect(`/mypage/members/${id}`);
    }
    if (actorRole === "admin" && targetRole === "admin") {
      redirect(`/mypage/members/${id}`);
    }
  }

  // 法人プラン判定（organization_id 非 NULL = 法人）
  const isCorporate = true; // organization_members にレコードがある時点で法人プラン

  const initialValues = {
    lastName: target.user.last_name ?? "",
    firstName: target.user.first_name ?? "",
    email: target.user.email,
    orgRole: target.org_role === "owner" ? "admin" : target.org_role,
    isProxyAccount: target.is_proxy_account,
  } as const;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        担当者編集
      </h1>
      <div className="mt-6">
        <MemberForm
          mode="update"
          targetUserId={id}
          actorRole={actorRole}
          isCorporate={isCorporate}
          targetRole={targetRole}
          isSelfEdit={isSelfEdit}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}
