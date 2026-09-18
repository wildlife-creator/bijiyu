"use client";

/**
 * 料金プラン画面（BillingClient）の小さな部品。
 */

import { type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BANK_TRANSFER_CONTACT_MESSAGE } from "@/lib/billing/bank-transfer";
import {
  VIDEO_OPTION_SHORT_NAMES,
  VIDEO_OPTION_UI_NAMES,
  type VideoOptionType,
} from "@/lib/billing/options";

export function formatPrice(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

/** ISO 日時 → YYYY/MM/DD（不正な値はそのまま返す）。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export interface VideoOptionRowProps {
  optionType: VideoOptionType;
  price: string;
  summary: string;
  details: ReactNode;
  purchased: boolean;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}

export function VideoOptionRow({
  optionType,
  price,
  summary,
  details,
  purchased,
  disabled,
  pending,
  onClick,
}: VideoOptionRowProps) {
  const name = VIDEO_OPTION_UI_NAMES[optionType];
  const shortName = VIDEO_OPTION_SHORT_NAMES[optionType];
  return (
    <div className="py-4 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-md font-bold">{name}</span>
        <span className="shrink-0 text-body-md">{price}</span>
      </div>
      <p className="mt-1 text-body-sm text-muted-foreground">{summary}</p>
      <details className="mt-1 text-body-sm text-muted-foreground">
        <summary className="cursor-pointer text-secondary underline-offset-2 hover:underline">
          詳しく見る
        </summary>
        <p className="mt-1">{details}</p>
      </details>
      <div className="mt-3 flex flex-col items-center gap-2">
        <Button
          variant="default"
          className="w-full max-w-xs rounded-full text-white"
          disabled={disabled}
          pending={pending}
          onClick={onClick}
        >
          {purchased ? `${shortName}を再度購入する` : `${shortName}を申し込む`}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 銀行振込: 案内文（画面末尾へ表示）
// ---------------------------------------------------------------------------

/**
 * 銀行振込はお問い合わせで受け付け、運営が管理画面で有効にする。ここではリンクだけ出す。
 */
export function BankTransferContactNote() {
  return (
    <p className="mt-4 text-center text-body-sm text-muted-foreground">
      {BANK_TRANSFER_CONTACT_MESSAGE.replace("お問い合わせください", "")}
      <Link href="/contact" className="text-primary underline underline-offset-2">
        お問い合わせ
      </Link>
      ください。
    </p>
  );
}
