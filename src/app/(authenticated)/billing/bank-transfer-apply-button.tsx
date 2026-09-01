"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeBankTransferAmount,
  describeBankTransferTarget,
  type BankTransferTarget,
} from "@/lib/billing/bank-transfer";
import { isSubscriptionOption, type OptionType } from "@/lib/billing/options";
import {
  BILLING_CYCLE_LABELS,
  type BillingCycle,
  type PaidPlanType,
} from "@/lib/constants/plans";

import {
  requestBankTransferAction,
  type BankTransferRequestInput,
} from "./bank-transfer-actions";

type ApplyTarget =
  | { kind: "plan"; planType: PaidPlanType }
  | { kind: "option"; optionType: OptionType; jobId?: string };

interface BankTransferApplyButtonProps {
  target: ApplyTarget;
  /** プラン申込で初回事務手数料が乗るか（画面表示用。確定はサーバー側） */
  needsInitialFee?: boolean;
  disabled?: boolean;
  /** disabled のときにボタンの title に出す理由 */
  disabledReason?: string | null;
}

function yen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円（税込）`;
}

/**
 * CLI-026 の「銀行振込で申し込む」ボタン（P2）。
 * 押すと確認ダイアログを開き、プラン / 補償は月払い・年払いを選べる。
 * 確定で requestBankTransferAction を呼び、成功時はトースト + router.refresh()。
 * 決済はアプリ外（請求書は運営が送付）。振込先・支払期限はここには出さない。
 */
export function BankTransferApplyButton({
  target,
  needsInitialFee = false,
  disabled = false,
  disabledReason = null,
}: BankTransferApplyButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [isPending, startTransition] = useTransition();

  const cycleSelectable =
    target.kind === "plan" || isSubscriptionOption(target.optionType);

  const fullTarget: BankTransferTarget =
    target.kind === "plan"
      ? { kind: "plan", planType: target.planType, billingCycle: cycle }
      : {
          kind: "option",
          optionType: target.optionType,
          billingCycle: cycleSelectable ? cycle : undefined,
        };
  const amount = computeBankTransferAmount(fullTarget, { needsInitialFee });
  const targetLabel = describeBankTransferTarget(fullTarget);

  function buildInput(): BankTransferRequestInput {
    if (target.kind === "plan") {
      return { type: "plan", planType: target.planType, billingCycle: cycle };
    }
    if (
      target.optionType === "compensation_5000" ||
      target.optionType === "compensation_9800"
    ) {
      return { type: "option", optionType: target.optionType, billingCycle: cycle };
    }
    if (target.optionType === "urgent") {
      return { type: "option", optionType: "urgent", jobId: target.jobId ?? "" };
    }
    return { type: "option", optionType: target.optionType };
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await requestBankTransferAction(buildInput());
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(
        `${result.data?.targetLabel ?? targetLabel}を銀行振込でお申し込みいただきました。担当より請求書をお送りします`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full max-w-xs rounded-full text-primary border-primary/50"
        disabled={disabled || isPending}
        title={disabled ? (disabledReason ?? undefined) : undefined}
        onClick={() => setOpen(true)}
      >
        銀行振込で申し込む
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>銀行振込で申し込む</DialogTitle>
            <DialogDescription>
              お申し込み後、担当より請求書をお送りします。ご入金の確認後にご利用開始となります（決済はアプリ外で行います）。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-body-sm">
            {cycleSelectable && (
              <div className="space-y-1">
                <p className="font-bold">お支払いサイクル</p>
                <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
                  <SelectTrigger className="w-full bg-background" aria-label="お支払いサイクル">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{BILLING_CYCLE_LABELS.monthly}</SelectItem>
                    <SelectItem value="yearly">{BILLING_CYCLE_LABELS.yearly}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p>お申し込み内容: {targetLabel}</p>
              <p>本体価格: {yen(amount.amount)}</p>
              {amount.initialFee > 0 && <p>初回事務手数料: {yen(amount.initialFee)}</p>}
              <p className="font-bold">請求合計: {yen(amount.total)}</p>
            </div>
            {target.kind === "plan" && (
              <p className="text-body-xs text-muted-foreground">
                ご利用期間は入金確認後の開始日から{cycle === "yearly" ? "1年間" : "1か月間"}です。継続の際はあらためて請求書をお送りします。
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              className="rounded-full bg-primary text-white hover:bg-primary/90"
              onClick={handleConfirm}
              disabled={isPending}
              pending={isPending}
            >
              この内容で申し込む
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
