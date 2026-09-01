import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { fetchBankTransferRequestDetail } from "@/lib/admin/bank-transfers";
import {
  OPEN_BANK_TRANSFER_STATUSES,
  isoToJstDateString,
  todayJstDateString,
  type BankTransferRequestStatus,
} from "@/lib/billing/bank-transfer";
import {
  BILLING_CYCLE_LABELS,
  PAYMENT_METHOD_LABELS,
  PLAN_LABELS,
  type PlanType,
} from "@/lib/constants/plans";
import { addDaysToDateString, formatDateJst, formatDateTime } from "@/lib/utils/format-date";

import { BankTransferMemoForm } from "./memo-form";
import { BankTransferRequestActions } from "./request-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_BADGE_CLASS: Record<BankTransferRequestStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  invoiced: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
};

function yen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円（税込）`;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
}) {
  const isString = typeof value === "string";
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <p className="bg-primary/[0.08] px-4 py-2 text-body-sm font-medium text-foreground">
        {label}
      </p>
      <div className="px-4 py-3 text-body-md text-foreground">
        {value == null || (isString && !value) ? "—" : value}
      </div>
    </div>
  );
}

/**
 * ADM-026: 銀行振込申込詳細（P2）。
 * デザインカンプなし（ADM-004 の DetailRow 様式に合わせる）。
 *
 * 運営の操作: 請求書送付済にする → 入金確認して有効化（利用開始日を指定）/ 申込を取り消す。
 * 有効化後（入金確認済）は契約行の操作（プラン変更・期限延長・解約）を発注者詳細（ADM-004）で行う。
 */
export default async function AdminBankTransferDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await fetchBankTransferRequestDetail(id);
  if (!detail) notFound();

  const isOpen = (OPEN_BANK_TRANSFER_STATUSES as readonly string[]).includes(detail.status);

  // 利用開始日の既定値: 当日。Stripe 契約中（D8）なら Stripe の期間終了日の翌日を提案
  const today = todayJstDateString();
  const stripeActiveUntil =
    detail.currentSubscription?.paymentMethod === "stripe" &&
    detail.currentSubscription.currentPeriodEnd
      ? isoToJstDateString(detail.currentSubscription.currentPeriodEnd)
      : null;
  const suggestedStartDate =
    stripeActiveUntil && stripeActiveUntil >= today
      ? addDaysToDateString(stripeActiveUntil, 1)
      : today;

  const applicantHref =
    detail.applicant.role === "client"
      ? `/admin/clients/${detail.userId}`
      : `/admin/users/${detail.userId}`;

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        銀行振込申込詳細
      </h1>

      <div className="mt-6 flex items-center justify-between">
        <span
          className={`rounded-full px-3 py-1 text-body-sm font-bold ${STATUS_BADGE_CLASS[detail.status]}`}
        >
          {detail.statusLabel}
        </span>
        <span className="text-body-sm text-muted-foreground">
          申込 {formatDateTime(detail.createdAt)}
        </span>
      </div>

      {/* 申込者 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">申込者</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="会社名" value={detail.applicant.companyName} />
          <DetailRow
            label="氏名"
            value={
              <span>
                {detail.applicant.name}
                {detail.applicant.isDeleted && (
                  <span className="ml-2 text-body-sm font-bold text-muted-foreground">
                    ※退会済み
                  </span>
                )}
              </span>
            }
          />
          <DetailRow label="メールアドレス" value={detail.applicant.email} />
          <DetailRow
            label="現在の有効プラン"
            value={
              detail.currentSubscription ? (
                <span>
                  {PLAN_LABELS[detail.currentSubscription.planType as PlanType] ??
                    detail.currentSubscription.planType}
                  （{PAYMENT_METHOD_LABELS[detail.currentSubscription.paymentMethod]}
                  {detail.currentSubscription.currentPeriodEnd &&
                    `・${formatDateJst(detail.currentSubscription.currentPeriodEnd)} まで`}
                  ）
                </span>
              ) : (
                "なし（無料プラン）"
              )
            }
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button asChild variant="outline" className="rounded-full">
            <Link href={applicantHref}>アカウント詳細を見る</Link>
          </Button>
        </div>
      </section>

      {/* 申込内容 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">申込内容</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="お申し込み内容" value={detail.targetLabel} />
          {detail.jobTitle && <DetailRow label="対象案件" value={detail.jobTitle} />}
          <DetailRow label="支払サイクル" value={BILLING_CYCLE_LABELS[detail.billingCycle]} />
          <DetailRow label="本体価格" value={yen(detail.amount)} />
          {detail.initialFee > 0 && (
            <DetailRow label="初回事務手数料" value={yen(detail.initialFee)} />
          )}
          <DetailRow
            label="請求合計"
            value={<span className="font-bold">{yen(detail.amount + detail.initialFee)}</span>}
          />
        </div>
      </section>

      {/* 処理状況 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">処理状況</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="申込受付" value={formatDateTime(detail.createdAt)} />
          <DetailRow
            label="請求書送付"
            value={detail.invoicedAt ? formatDateTime(detail.invoicedAt) : "未送付"}
          />
          <DetailRow
            label="入金確認・有効化"
            value={
              detail.paidAt
                ? `${formatDateTime(detail.paidAt)}（利用開始日 ${detail.startDate ? detail.startDate.replaceAll("-", "/") : "—"}${detail.activatedPeriodEnd ? ` ／ 有効期限 ${formatDateJst(detail.activatedPeriodEnd)}` : ""}）`
                : "未確認"
            }
          />
          {detail.cancelledAt && (
            <DetailRow label="取消" value={formatDateTime(detail.cancelledAt)} />
          )}
          <DetailRow label="最終操作者" value={detail.handledByName} />
        </div>
      </section>

      {/* 操作 */}
      {isOpen && !detail.applicant.isDeleted && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">操作</h2>
          {stripeActiveUntil && stripeActiveUntil >= today && (
            <p className="mt-2 rounded-[8px] border border-amber-300 bg-amber-50 px-4 py-3 text-body-sm text-amber-900">
              この方はクレジットカードでプランをご契約中です（{stripeActiveUntil.replaceAll("-", "/")} まで）。
              二重契約を避けるため、有効化はその期間が終わってから、翌日
              {suggestedStartDate.replaceAll("-", "/")} を利用開始日にして行ってください。
            </p>
          )}
          <BankTransferRequestActions
            requestId={detail.id}
            status={detail.status}
            targetLabel={detail.targetLabel}
            suggestedStartDate={suggestedStartDate}
          />
        </section>
      )}
      {detail.status === "paid" && (
        <section className="mt-6 rounded-[8px] border border-border/20 bg-background px-4 py-3 text-body-sm text-muted-foreground">
          有効化済みです。プランの変更・期限延長・解約は
          <Link href={applicantHref} className="mx-1 text-primary underline">
            アカウント詳細
          </Link>
          から行ってください。
        </section>
      )}

      {/* 運営メモ */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">運営メモ</h2>
        {/* key でメモ内容が変わったら（取消理由の追記など）フォームの state を作り直す */}
        <BankTransferMemoForm
          key={detail.adminMemo ?? ""}
          requestId={detail.id}
          initialMemo={detail.adminMemo ?? ""}
        />
      </section>

      <div className="mt-8 flex justify-center">
        <Button asChild variant="outline" className="w-full max-w-xs rounded-full">
          <Link href="/admin/bank-transfers">一覧にもどる</Link>
        </Button>
      </div>
    </div>
  );
}
