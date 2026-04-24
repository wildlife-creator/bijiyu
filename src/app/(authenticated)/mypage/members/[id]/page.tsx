import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
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

  // 招待再送ボタン: Owner/Admin + password_set_at IS NULL + 本人以外。
  // ただし Owner 自身は通常サインアップ経由のため招待対象から除外する安全網。
  const showResendInvite =
    (actorRole === "owner" || actorRole === "admin") &&
    target.org_role !== "owner" &&
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

      {/* 情報テーブル — CLI-006 と同じく plain div で rows を密着させる（Card の gap-4 を避ける） */}
      <div className="mt-4 overflow-hidden rounded-[8px] border border-border/10 bg-background">
        <SectionLabel>名前</SectionLabel>
        <div className="flex min-h-[40px] items-center px-4 py-2">
          <span className="text-body-sm">
            {formatName(target.user.last_name, target.user.first_name)}
            {target.user.deleted_at && (
              <span className="ml-2 text-body-xs text-destructive">
                ※削除済
              </span>
            )}
          </span>
        </div>

        <SectionLabel>メールアドレス</SectionLabel>
        <div className="flex min-h-[40px] items-center px-4 py-2">
          <span className="break-all text-body-sm">{target.user.email}</span>
        </div>

        <SectionLabel>権限</SectionLabel>
        <div className="flex min-h-[40px] items-center px-4 py-2">
          <div className="flex items-center gap-2 text-body-sm">
            <span>{roleLabel(target.org_role)}</span>
            {target.is_proxy_account && (
              <span className="rounded-full bg-secondary/10 px-2 text-body-xs leading-5 text-secondary">
                代理
              </span>
            )}
            {target.user.password_set_at === null &&
              !target.user.deleted_at &&
              target.org_role !== "owner" && (
                <span className="rounded-full bg-primary/10 px-2 text-body-xs leading-5 text-primary">
                  招待中
                </span>
              )}
          </div>
        </div>
      </div>

      {/* アクションボタン: 編集する → 招待を再送する → もどる を等間隔で縦並び */}
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
        {showResendInvite && <ResendInviteButton targetUserId={id} />}
        {/* 戻り先は isSelf で分岐（REQ-ORG-011）:
            - 自分の詳細 → /mypage（mypage の「プロフィールを変更する」「ユーザープロフィール変更」
              経由でここに来た場合の mental model に合わせる）
            - 他人の詳細 → /mypage/members（CLI-022 担当者一覧から drill-down した場合の想定） */}
        <BackButton
          className="w-full max-w-xs"
          href={isSelf ? "/mypage" : "/mypage/members"}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center bg-primary/[0.08] px-4 py-2">
      <span className="text-body-sm font-medium">{children}</span>
    </div>
  );
}
