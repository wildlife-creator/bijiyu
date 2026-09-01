"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PendingOverlay } from "@/components/shared/pending-overlay";
import { BANK_TRANSFER_STATUS_LABELS } from "@/lib/billing/bank-transfer";

interface BankTransferFiltersProps {
  /** "all" | BankTransferRequestStatus */
  initialStatus: string;
}

const STATUS_ITEMS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "requested", label: BANK_TRANSFER_STATUS_LABELS.requested },
  { value: "invoiced", label: BANK_TRANSFER_STATUS_LABELS.invoiced },
  { value: "paid", label: BANK_TRANSFER_STATUS_LABELS.paid },
  { value: "cancelled", label: BANK_TRANSFER_STATUS_LABELS.cancelled },
];

/**
 * ADM-025 の状態フィルタ（単一選択）。URL searchParams を SSOT とし、選択即時に router.push する。
 */
export function BankTransferFilters({ initialStatus }: BankTransferFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (value !== "all") params.set("status", value);
    startTransition(() =>
      router.push(`/admin/bank-transfers${params.toString() ? `?${params}` : ""}`),
    );
  }

  return (
    <div className="mt-6">
      <PendingOverlay active={isPending} />
      <label htmlFor="bank-transfer-status" className="text-body-sm font-bold">
        状態
      </label>
      <Select value={initialStatus || "all"} onValueChange={handleChange}>
        <SelectTrigger id="bank-transfer-status" className="mt-1 w-full bg-background">
          <SelectValue placeholder="お選びください" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ITEMS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
