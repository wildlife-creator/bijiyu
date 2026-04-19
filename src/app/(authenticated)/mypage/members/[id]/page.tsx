import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";

import { DeleteMemberButton } from "./delete-member-button";
import { ResendInviteButton } from "./resend-invite-button";

type OrgRole = "owner" | "admin" | "staff";

function roleLabel(role: OrgRole): string {
  if (role === "owner") return "管理責任者";
  if (role === "admin") return "管理者";
  return "担当者";
}

function formatName(lastName: string | null, firstName: string | null): string {
  const last = (lastName ?? "").trim();
  const first = (firstName ?? "").trim();
  if (!last && !first) return "未設定";
  return `${last}　${first}`.trim();
}

/**
 * CLI-023 での編集・削除可否
 * 対象ロール表（requirements.md）準拠
 */
function resolveActions(
  actorRole: OrgRole,
  targetRole: OrgRole,
  isSelf: boolean,
): {
  editLabel: string | null;
  editHref: string | null;
  canDelete: boolean;
} {
  // 自己編集の場合
  if (isSelf) {
    if (actorRole === "owner") {
      return {
        editLabel: "プロフィールを編集",
        editHref: "/profile/edit",
        canDelete: false,
      };
    }
    // admin / staff は CLI-024 自己編集モードへ（[id] = 自分のID）
    return {
      editLabel: "プロフィールを編集",
      editHref: null, // caller 側で [id] を埋める
      canDelete: false,
    };
  }

  // Owner が下位ロールを開く
  if (actorRole === "owner" && targetRole !== "owner") {
    return {
      editLabel: "編集する",
      editHref: null, // caller 側で対象 ID を埋める
      canDelete: true,
    };
  }

  // Admin が Staff を開く
  if (actorRole === "admin" && targetRole === "staff") {
    return {
      editLabel: "編集する",
      editHref: null,
      canDelete: true,
    };
  }

  // その他は編集・削除ボタン非表示
  return { editLabel: null, editHref: null, canDelete: false };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MemberDetailPage({ params }: PageProps) {
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

  // 対象メンバー取得
  const { data: targetRow } = await supabase
    .from("organization_members")
    .select(
      `org_role, is_proxy_account, user_id,
       user:users!user_id(id, last_name, first_name, email, deleted_at, password_set_at)`,
    )
    .eq("organization_id", actorMember.organization_id)
    .eq("user_id", id)
    .maybeSingle();

  type TargetRow = {
    org_role: OrgRole;
    is_proxy_account: boolean;
    user_id: string;
    user: {
      id: string;
      last_name: string | null;
      first_name: string | null;
      email: string;
      deleted_at: string | null;
      password_set_at: string | null;
    } | null;
  };

  const target = targetRow as unknown as TargetRow | null;
  if (!target || !target.user) notFound();

  const actorRole = actorMember.org_role as OrgRole;
  const targetRole = target.org_role;
  const isSelf = user.id === id;

  const actions = resolveActions(actorRole, targetRole, isSelf);
  const editHref = actions.editHref ?? `/mypage/members/${id}/edit`;

  // 招待再送ボタン: Owner/Admin + password_set_at IS NULL + 本人以外
  const showResendInvite =
    (actorRole === "owner" || actorRole === "admin") &&
    target.user.password_set_at === null &&
    !target.user.deleted_at &&
    !isSelf;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        担当者詳細
      </h1>

      {/* 削除する ボタン */}
      {actions.canDelete && (
        <div className="mt-6 flex justify-end">
          <DeleteMemberButton targetUserId={id} />
        </div>
      )}

      {/* カード: 名前 / メール / 権限 */}
      <Card className="mt-4 overflow-hidden rounded-[8px] p-0">
        <SectionLabel>名前</SectionLabel>
        <div className="bg-background px-4 py-3">
          <p className="text-body-md text-foreground">
            {formatName(target.user.last_name, target.user.first_name)}
            {target.user.deleted_at && (
              <span className="ml-2 text-body-xs text-destructive">
                ※削除済
              </span>
            )}
          </p>
        </div>

        <SectionLabel>メールアドレス</SectionLabel>
        <div className="bg-background px-4 py-3">
          <p className="text-body-md text-foreground break-all">
            {target.user.email}
          </p>
        </div>

        <SectionLabel>権限</SectionLabel>
        <div className="bg-background px-4 py-3">
          <div className="flex items-center gap-2 text-body-md text-foreground">
            <span>{roleLabel(target.org_role)}</span>
            {target.is_proxy_account && (
              <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-body-xs text-secondary">
                代理
              </span>
            )}
            {target.user.password_set_at === null &&
              !target.user.deleted_at && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-body-xs text-primary">
                  招待中
                </span>
              )}
          </div>
        </div>
      </Card>

      {/* 招待再送ボタン */}
      {showResendInvite && (
        <div className="mt-4 flex justify-center">
          <ResendInviteButton targetUserId={id} />
        </div>
      )}

      {/* 編集する + もどる */}
      <div className="mt-8 flex flex-col items-center gap-3">
        {actions.editLabel && (
          <Button
            asChild
            size="lg"
            className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          >
            <Link href={editHref}>{actions.editLabel}</Link>
          </Button>
        )}
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border bg-muted/60 px-4 py-2 first:border-t-0">
      <p className="text-body-sm font-medium text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
