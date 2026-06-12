import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  CLIENT_CATEGORY_LABELS,
  CLIENT_OPTION_BADGE_LABELS,
  fetchClientListPage,
  type ClientCategory,
  type ClientOptionBadge,
} from "@/lib/admin/clients-list";
import { AdminClientFilters } from "./filters";

const VALID_CATEGORIES = [
  "owner",
  "org_admin",
  "org_staff",
  "individual",
  "small",
] as const;
const VALID_OPTIONS = ["urgent", "video_workplace"] as const;
const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    option?: string;
    page?: string;
  }>;
}

/**
 * ADM-003: 発注者アカウント一覧。
 * デザインカンプ: design-assets/screens/ADM-003.png
 *
 * - role IN ('client','staff') を人単位1行で表示（退会済み含む）
 * - 区分・プラン・オプションバッジは契約主体から導出（fetchClientListPage）
 * - 行クリックは常に契約主体（ADM-004 の id）へ。スタッフ行は所属組織 Owner へ解決
 */
export default async function AdminClientsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const category = VALID_CATEGORIES.includes(
    sp.category as (typeof VALID_CATEGORIES)[number],
  )
    ? (sp.category as ClientCategory)
    : undefined;
  const option = VALID_OPTIONS.includes(
    sp.option as (typeof VALID_OPTIONS)[number],
  )
    ? (sp.option as ClientOptionBadge)
    : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, totalCount } = await fetchClientListPage({
    keyword: keyword || undefined,
    category,
    option,
    page,
  });

  const offset = (page - 1) * PAGE_SIZE;
  const hasPrev = page > 1;
  const hasNext = offset + PAGE_SIZE < totalCount;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (category) params.set("category", category);
    if (option) params.set("option", option);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/admin/clients${params.toString() ? `?${params}` : ""}`;
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者 アカウント一覧
      </h1>

      <AdminClientFilters
        initialKeyword={keyword}
        initialCategory={category ?? "all"}
        initialOption={option ?? "all"}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{totalCount}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当する発注者がいません
          </p>
        ) : (
          rows.map((row) => {
            const content = (
              <>
                <div className="flex w-24 shrink-0 flex-col items-start gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-body-xs text-muted-foreground">
                    {row.category ? CLIENT_CATEGORY_LABELS[row.category] : "—"}
                  </span>
                  {row.optionBadges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-body-xs text-primary"
                    >
                      {CLIENT_OPTION_BADGE_LABELS[badge]}
                    </span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  {row.companyName && (
                    <p className="truncate text-body-md font-medium text-foreground">
                      {row.companyName}
                    </p>
                  )}
                  <p className="text-body-md text-foreground">
                    {row.name}
                    {row.isDeleted && (
                      <span className="ml-2 text-body-sm font-bold text-muted-foreground">
                        ※退会済み
                      </span>
                    )}
                  </p>
                  <p className="truncate text-body-sm text-muted-foreground">
                    {row.email}
                  </p>
                  {row.planLabel && (
                    <p className="text-body-xs text-muted-foreground">
                      プラン: {row.planLabel}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground">›</span>
              </>
            );

            return row.contractHolderId ? (
              <Link
                key={row.userId}
                href={`/admin/clients/${row.contractHolderId}`}
                className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
              >
                {content}
              </Link>
            ) : (
              <div
                key={row.userId}
                className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0"
              >
                {content}
              </div>
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
          className="w-full max-w-xs rounded-full bg-primary text-white hover:bg-primary/90"
        >
          <Link href="/admin/clients/new">管理責任者 新規登録</Link>
        </Button>
        <Button asChild variant="outline" className="w-full max-w-xs rounded-full">
          <Link href="/admin/dashboard">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
