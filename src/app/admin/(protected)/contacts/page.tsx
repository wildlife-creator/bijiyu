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
 * ADM-016: お問い合わせ一覧（デザインカンプなし・admin 共通スタイル）。
 * 受信日時降順・20件・絞込なし（共通方針）。
 * 「登録ユーザー」バッジは user_id あり時のみ（未ログイン送信があり得る contacts だけの仕様）。
 */
export default async function AdminContactsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const backTo = resolveBackTo(sp.backTo);

  const admin = createAdminClient();

  let query = admin
    .from("contacts")
    .select("id, created_at, company_name, name, inquiry_type, user_id", {
      count: "exact",
    });

  if (keyword) {
    query = query.or(
      `company_name.ilike.%${keyword}%,name.ilike.%${keyword}%,email.ilike.%${keyword}%`,
    );
  }

  const { data: contacts, count } = await query
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
    return `/admin/contacts${params.toString() ? `?${params}` : ""}`;
  }

  // 行クリックで詳細に行く際の backTo 値（自分の URL + 上位 backTo を継承）
  const currentListPath = pageHref(page);
  const rowBackToValue = buildBackToValue(currentListPath, backTo);

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        お問い合わせ一覧
      </h1>

      <KeywordSearchForm
        basePath="/admin/contacts"
        placeholder="会社名/屋号・氏名・メールアドレス"
        initialKeyword={keyword}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{total}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {(contacts ?? []).length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当するお問い合わせがありません
          </p>
        ) : (
          (contacts ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/admin/contacts/${c.id}?backTo=${encodeURIComponent(rowBackToValue)}`}
              className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-muted-foreground">
                  {formatDateTime(c.created_at)}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-body-md font-medium text-foreground">
                  <span className="truncate">
                    {c.company_name}　{c.name}
                  </span>
                  {c.user_id && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-body-xs font-medium text-primary">
                      登録ユーザー
                    </span>
                  )}
                </p>
                <p className="truncate text-body-sm text-primary">
                  {c.inquiry_type}
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
