import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { AdminUserFilters } from "./filters";

const PAGE_SIZE = 20;
// 受注者向けオプションのみ（職場紹介動画は発注者向けのため ADM-003 側のフィルタに置く）
const VALID_OPTIONS = [
  "video",
  "compensation_5000",
  "compensation_9800",
] as const;

interface PageProps {
  searchParams: Promise<{ q?: string; option?: string; page?: string }>;
}

/**
 * ADM-008: ユーザーアカウント一覧。
 * デザインカンプ: design-assets/screens/ADM-008.png
 *
 * - 対象は「受注者機能を使える人」= role IN ('contractor', 'client')
 *   （staff は発注者一覧 ADM-003 側・admin は運営のため除外）。退会済みは表示する
 * - キーワード検索（氏名・メールアドレス）+ オプションプラン加入者フィルタ（3 単一選択）。
 * - 絞り込みはサーバー側で適用。option フィルタは対象 option_type の active な
 *   user_id 集合を取り、メインクエリに `.in("id", ids)` で渡す。
 * - 20 件ページネーション。フィルタ状態は URL searchParams を SSOT とする。
 */
export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const option = VALID_OPTIONS.includes(sp.option as (typeof VALID_OPTIONS)[number])
    ? (sp.option as (typeof VALID_OPTIONS)[number])
    : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  // オプションフィルタ: active な対象 option_type を持つ user_id 集合を先に取得
  let optionUserIds: string[] | null = null;
  if (option) {
    const { data: optRows } = await admin
      .from("option_subscriptions")
      .select("user_id")
      .eq("option_type", option)
      .eq("status", "active");
    optionUserIds = Array.from(
      new Set((optRows ?? []).map((r) => r.user_id)),
    );
  }

  let query = admin
    .from("users")
    .select("id, last_name, first_name, email, birth_date, deleted_at", {
      count: "exact",
    })
    .in("role", ["contractor", "client"]);

  if (keyword) {
    // 氏名（姓・名）・メールアドレスの部分一致
    query = query.or(
      `last_name.ilike.%${keyword}%,first_name.ilike.%${keyword}%,email.ilike.%${keyword}%`,
    );
  }

  if (optionUserIds !== null) {
    // 該当 0 件なら確実に空を返すためのセンチネル
    query = query.in("id", optionUserIds.length > 0 ? optionUserIds : ["__none__"]);
  }

  const { data: users, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasPrev = page > 1;
  const hasNext = offset + PAGE_SIZE < total;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (option) params.set("option", option);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/admin/users${params.toString() ? `?${params}` : ""}`;
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザーアカウント一覧
      </h1>

      <AdminUserFilters initialKeyword={keyword} initialOption={option} />

      <p className="mt-6 text-body-md font-bold">検索結果：{total}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {(users ?? []).length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当するユーザーがいません
          </p>
        ) : (
          (users ?? []).map((u) => {
            const name = getUserDisplayName({
              lastName: u.last_name,
              firstName: u.first_name,
              deletedAt: u.deleted_at,
            });
            const age = u.birth_date ? calculateAge(u.birth_date) : null;
            return (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-md font-medium text-foreground">
                    {name}
                    {age !== null && <span>（{age}歳）</span>}
                    {u.deleted_at && (
                      <span className="ml-2 text-body-sm font-bold text-muted-foreground">
                        ※退会済み
                      </span>
                    )}
                  </p>
                  <p className="truncate text-body-sm text-muted-foreground">
                    {u.email}
                  </p>
                </div>
                <span className="text-muted-foreground">›</span>
              </Link>
            );
          })
        )}
      </div>

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex justify-center gap-3">
          {hasPrev && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page - 1)}>＜前の20件</Link>
            </Button>
          )}
          {hasNext && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page + 1)}>次の20件＞</Link>
            </Button>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/dashboard">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
