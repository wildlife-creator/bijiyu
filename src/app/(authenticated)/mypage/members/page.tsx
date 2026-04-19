import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";
import { ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

function ordRank(role: "owner" | "admin" | "staff"): number {
  return role === "owner" ? 0 : role === "admin" ? 1 : 2;
}

function roleLabel(role: "owner" | "admin" | "staff"): string {
  if (role === "owner") return "管理責任者";
  if (role === "admin") return "管理者";
  return "担当者";
}

function formatName(lastName: string | null, firstName: string | null): string {
  const last = (lastName ?? "").trim();
  const first = (firstName ?? "").trim();
  if (!last && !first) return "未設定";
  // CLI-022 / CLI-023 の一覧表示は視認性のため全角スペース区切り
  return `${last}　${first}`.trim();
}

export default async function MembersListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 操作者の組織 + ロール取得
  const { data: actorMember } = await supabase
    .from("organization_members")
    .select("organization_id, org_role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actorMember) redirect("/mypage");

  const canCreate =
    actorMember.org_role === "owner" || actorMember.org_role === "admin";

  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * ITEMS_PER_PAGE;
  const q = (sp.q ?? "").trim();

  // 全メンバー取得（ページネーションは並び順ロジックの都合で一旦全件 → slice）
  // 組織の規模上限（maxStaff=30）からして影響軽微
  let query = supabase
    .from("organization_members")
    .select(
      `org_role, is_proxy_account, created_at,
       user:users!user_id(id, last_name, first_name, email, deleted_at, password_set_at)`,
    )
    .eq("organization_id", actorMember.organization_id);

  const { data: membersRaw } = await query;

  type MemberRow = {
    org_role: "owner" | "admin" | "staff";
    is_proxy_account: boolean;
    created_at: string;
    user: {
      id: string;
      last_name: string | null;
      first_name: string | null;
      email: string;
      deleted_at: string | null;
      password_set_at: string | null;
    } | null;
  };

  const all = ((membersRaw ?? []) as unknown as MemberRow[]).filter(
    (m) => m.user !== null,
  );

  // キーワード検索（氏名・メール部分一致）
  const lowered = q.toLowerCase();
  const filtered = q
    ? all.filter((m) => {
        const u = m.user!;
        const name = `${u.last_name ?? ""}${u.first_name ?? ""}`.toLowerCase();
        return (
          name.includes(lowered) || u.email.toLowerCase().includes(lowered)
        );
      })
    : all;

  // 並び順: owner → admin → staff、各ロール内は created_at 昇順
  filtered.sort((a, b) => {
    const d = ordRank(a.org_role) - ordRank(b.org_role);
    if (d !== 0) return d;
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });

  const totalCount = filtered.length;
  const paginated = filtered.slice(offset, offset + ITEMS_PER_PAGE);

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        担当者一覧
      </h1>

      {/* キーワード検索（form GET） */}
      <form method="get" className="mt-6 space-y-3">
        <div>
          <label
            htmlFor="q"
            className="text-body-sm font-medium text-foreground"
          >
            キーワード
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="氏名・メールで検索"
            className="mt-1 bg-background"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            className="rounded-pill bg-primary px-8 text-white hover:bg-primary/90"
          >
            検索
          </Button>
        </div>
      </form>

      <p className="mt-4 text-body-sm text-muted-foreground">
        検索結果: {totalCount}件
      </p>

      {/* メンバーカードリスト */}
      <div className="mt-3 space-y-3">
        {paginated.length === 0 ? (
          <Card className="rounded-[8px] p-6 text-center text-body-md text-muted-foreground">
            {q
              ? "該当する担当者が見つかりません"
              : "担当者はまだ登録されていません"}
          </Card>
        ) : (
          paginated.map((m) => {
            const u = m.user!;
            const displayName = formatName(u.last_name, u.first_name);
            const isDeleted = !!u.deleted_at;
            const isPending = u.password_set_at === null && !isDeleted;

            return (
              <Link
                key={u.id}
                href={`/mypage/members/${u.id}`}
                className="block"
              >
                <Card className="rounded-[8px] transition-colors hover:bg-background/60">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="shrink-0 rounded-[4px] bg-muted px-2 py-1 text-body-xs font-medium text-muted-foreground">
                      {roleLabel(m.org_role)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-body-md font-semibold text-foreground">
                        <span className="truncate">{displayName}</span>
                        {isDeleted && (
                          <span className="text-body-xs font-normal text-destructive">
                            ※削除済
                          </span>
                        )}
                        {isPending && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-body-xs font-normal text-primary">
                            招待中
                          </span>
                        )}
                        {m.is_proxy_account && (
                          <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-body-xs font-normal text-secondary">
                            代理
                          </span>
                        )}
                      </p>
                      <p className="truncate text-body-sm text-muted-foreground">
                        {u.email}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-primary/70" />
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      {/* ページネーション */}
      {totalCount > ITEMS_PER_PAGE && (
        <PaginationControls
          totalCount={totalCount}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      )}

      {/* 担当者新規登録 + もどる */}
      <div className="mt-8 flex flex-col items-center gap-3">
        {canCreate && (
          <Button
            asChild
            size="lg"
            className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          >
            <Link href="/mypage/members/new">担当者新規登録</Link>
          </Button>
        )}
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}
