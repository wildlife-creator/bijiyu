import Link from "next/link";

import { Button } from "@/components/ui/button";
import { KeywordSearchForm } from "@/components/admin/keyword-search-form";
import { buildBackToValue, resolveBackTo } from "@/lib/admin/back-to";
import {
  BANK_TRANSFER_PAGE_SIZE,
  fetchBankTransferContactList,
} from "@/lib/admin/bank-transfers";
import { formatDateTime } from "@/lib/utils/format-date";

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; backTo?: string }>;
}

/**
 * ADM-025: 銀行振込お問い合わせ一覧（P12）。
 * デザインカンプなし（ADM-016 お問い合わせ一覧のリスト様式に合わせる）。
 *
 * - お問い合わせのうち種類が「お支払い方法（銀行振込）について」のものだけを新着順で 20 件ページング
 * - ステータスは持たない。対応（有効化・変更・無効化）はユーザー詳細 / 発注者詳細の「銀行振込」枠で行う
 * - 各行から「お問い合わせ詳細」（ADM-017）と「ユーザー詳細」（発注者なら ADM-004）へ
 */
export default async function AdminBankTransfersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const backTo = resolveBackTo(sp.backTo);

  const { rows, totalCount } = await fetchBankTransferContactList({ keyword, page });

  const offset = (page - 1) * BANK_TRANSFER_PAGE_SIZE;
  const hasPrev = page > 1;
  const hasNext = offset + BANK_TRANSFER_PAGE_SIZE < totalCount;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (targetPage > 1) params.set("page", String(targetPage));
    if (backTo) params.set("backTo", backTo);
    return `/admin/bank-transfers${params.toString() ? `?${params}` : ""}`;
  }

  // 子画面（お問い合わせ詳細・ユーザー詳細）へ渡す戻り先 = 本画面の URL
  const rowBackToValue = buildBackToValue(pageHref(page), backTo);
  const withBackTo = (href: string) => `${href}?backTo=${encodeURIComponent(rowBackToValue)}`;

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        銀行振込お問い合わせ一覧
      </h1>
      <p className="mt-3 text-center text-body-sm text-muted-foreground">
        銀行振込を希望するお問い合わせです。入金を確認したら、ユーザー詳細の「銀行振込」でプランを有効にしてください。
      </p>

      <KeywordSearchForm
        basePath="/admin/bank-transfers"
        placeholder="会社名/屋号・氏名・メールアドレス"
        initialKeyword={keyword}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{totalCount}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当するお問い合わせがありません
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="border-b border-border/20 px-4 py-3 last:border-b-0"
            >
              <p className="text-body-xs text-muted-foreground">
                {formatDateTime(row.createdAt)}
              </p>
              <p className="mt-1 truncate text-body-md font-medium text-foreground">
                {row.companyName}
                <span className="ml-2 font-normal">{row.name}</span>
              </p>
              <p className="truncate text-body-sm text-muted-foreground">{row.email}</p>
              <p className="text-body-sm text-foreground">
                希望：{row.planLabel ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={withBackTo(`/admin/contacts/${row.id}`)}>お問い合わせ詳細</Link>
                </Button>
                {row.userDetailHref && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-full border-secondary text-secondary"
                  >
                    <Link href={withBackTo(row.userDetailHref)}>{row.userDetailLabel}</Link>
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex justify-center gap-3">
          {hasPrev && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page - 1)}>＜前の{BANK_TRANSFER_PAGE_SIZE}件</Link>
            </Button>
          )}
          {hasNext && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page + 1)}>次の{BANK_TRANSFER_PAGE_SIZE}件＞</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
