import Link from "next/link";

import { Button } from "@/components/ui/button";
import { KeywordSearchForm } from "@/components/admin/keyword-search-form";
import { buildBackToValue, resolveBackTo } from "@/lib/admin/back-to";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; backTo?: string }>;
}

/**
 * ADM-018: トラブル報告一覧（デザインカンプなし・admin 共通スタイル）。
 * 受信日時降順・20件・絞込なし（共通方針）。
 */
export default async function AdminTroubleReportsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const backTo = resolveBackTo(sp.backTo);

  const admin = createAdminClient();

  let query = admin
    .from("trouble_reports")
    .select("id, created_at, reporter_name, counterparty_name, category", {
      count: "exact",
    });

  if (keyword) {
    query = query.or(
      `reporter_name.ilike.%${keyword}%,counterparty_name.ilike.%${keyword}%,email.ilike.%${keyword}%`,
    );
  }

  const { data: reports, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasPrev = page > 1;
  const hasNext = offset + PAGE_SIZE < total;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (targetPage > 1) params.set("page", String(targetPage));
    if (backTo) params.set("backTo", backTo);
    return `/admin/trouble-reports${params.toString() ? `?${params}` : ""}`;
  }

  // 行クリックで詳細に行く際の backTo 値（自分の URL + 上位 backTo を継承）
  const currentListPath = pageHref(page);
  const rowBackToValue = buildBackToValue(currentListPath, backTo);

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        トラブル報告一覧
      </h1>

      <KeywordSearchForm
        basePath="/admin/trouble-reports"
        placeholder="報告者氏名・相手氏名・メールアドレス"
        initialKeyword={keyword}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{total}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {(reports ?? []).length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当するトラブル報告がありません
          </p>
        ) : (
          (reports ?? []).map((r) => (
            <Link
              key={r.id}
              href={`/admin/trouble-reports/${r.id}?backTo=${encodeURIComponent(rowBackToValue)}`}
              className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </p>
                <p className="mt-0.5 truncate text-body-md font-medium text-foreground">
                  {r.reporter_name}
                  <span className="mx-2 text-muted-foreground">→</span>
                  {r.counterparty_name}
                </p>
                <p className="truncate text-body-sm text-primary">
                  {r.category || "—"}
                </p>
              </div>
              <span className="text-muted-foreground">›</span>
            </Link>
          ))
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
          <Link href={backTo ?? "/admin/dashboard"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
