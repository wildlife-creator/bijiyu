import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  BANK_TRANSFER_PAGE_SIZE,
  fetchBankTransferRequestList,
  isBankTransferStatus,
} from "@/lib/admin/bank-transfers";
import type { BankTransferRequestStatus } from "@/lib/billing/bank-transfer";
import { formatDateTime } from "@/lib/utils/format-date";

import { BankTransferFilters } from "./filters";

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

const STATUS_BADGE_CLASS: Record<BankTransferRequestStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  invoiced: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
};

function yen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

/**
 * ADM-025: 銀行振込申込一覧（P2）。
 * デザインカンプなし（ADM-003 のリスト様式に合わせる）。
 *
 * - bank_transfer_requests を新着順で 20 件ページング。状態で絞込（既定: すべて）
 * - 行クリックで ADM-026（詳細・操作）へ
 */
export default async function AdminBankTransfersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = isBankTransferStatus(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, totalCount } = await fetchBankTransferRequestList({ status, page });

  const offset = (page - 1) * BANK_TRANSFER_PAGE_SIZE;
  const hasPrev = page > 1;
  const hasNext = offset + BANK_TRANSFER_PAGE_SIZE < totalCount;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/admin/bank-transfers${params.toString() ? `?${params}` : ""}`;
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        銀行振込申込一覧
      </h1>
      <p className="mt-3 text-center text-body-sm text-muted-foreground">
        申込受付 → 請求書送付 → 入金確認後に有効化、の順に処理します。
      </p>
      {/* P9: 会員側のボタンは既定で非表示。お問い合わせを受けた運営がここから代理登録する */}
      <div className="mt-4 flex justify-center">
        <Button className="rounded-full text-white" asChild>
          <Link href="/admin/bank-transfers/new">申込を登録する</Link>
        </Button>
      </div>

      <BankTransferFilters initialStatus={status ?? "all"} />

      <p className="mt-6 text-body-md font-bold">検索結果：{totalCount}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当する申込がありません
          </p>
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/admin/bank-transfers/${row.id}`}
              className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
            >
              <div className="flex w-24 shrink-0 flex-col items-start gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-body-xs ${STATUS_BADGE_CLASS[row.status]}`}
                >
                  {row.statusLabel}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                {row.companyName && (
                  <p className="truncate text-body-md font-medium text-foreground">
                    {row.companyName}
                  </p>
                )}
                <p className="text-body-md text-foreground">{row.applicantName}</p>
                <p className="truncate text-body-sm text-muted-foreground">{row.email}</p>
                <p className="text-body-xs text-muted-foreground">
                  {row.targetLabel} ／ {yen(row.amount + row.initialFee)}
                  {row.initialFee > 0 && "（初回事務手数料込）"}
                </p>
                <p className="text-body-xs text-muted-foreground">
                  申込 {formatDateTime(row.createdAt)}
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
