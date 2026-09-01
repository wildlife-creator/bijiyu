"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAID_PLAN_TYPES,
  PLAN_LABELS,
  type PaidPlanType,
} from "@/lib/constants/plans";

import {
  cancelBankSubscriptionAction,
  changeBankSubscriptionPlanAction,
  extendBankSubscriptionAction,
} from "./bank-subscription-actions";

interface BankSubscriptionPanelProps {
  subscriptionId: string;
  currentPlanType: PaidPlanType;
  /** 「月払い」「年払い」 */
  billingCycleLabel: string;
  /** YYYY/MM/DD 表記の有効期限 */
  periodEndLabel: string;
}

/**
 * ADM-004: 銀行振込契約の運営操作（プラン変更 / 期限延長 / 解約）。
 * Stripe 契約の発注者には表示しない（呼出側で payment_method を判定）。
 */
export function BankSubscriptionPanel({
  subscriptionId,
  currentPlanType,
  billingCycleLabel,
  periodEndLabel,
}: BankSubscriptionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [targetPlan, setTargetPlan] = useState<PaidPlanType>(currentPlanType);

  function run(key: string, fn: () => Promise<void>) {
    setPendingKey(key);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingKey(null);
      }
    });
  }

  function handleChangePlan() {
    run("plan", async () => {
      const fd = new FormData();
      fd.set("planType", targetPlan);
      const result = await changeBankSubscriptionPlanAction(subscriptionId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${PLAN_LABELS[targetPlan]}に変更しました`);
      router.refresh();
    });
  }

  function handleExtend() {
    run("extend", async () => {
      const result = await extendBankSubscriptionAction(subscriptionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`有効期限を ${result.data?.newPeriodEnd ?? ""} まで延長しました`);
      router.refresh();
    });
  }

  function handleCancel() {
    run("cancel", async () => {
      const result = await cancelBankSubscriptionAction(subscriptionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("解約しました");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-4 rounded-[8px] border border-border/20 bg-background p-4">
      {/* 期限延長 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-foreground">
          有効期限 <span className="font-bold">{periodEndLabel}</span>（{billingCycleLabel}）
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={isPending}
              pending={pendingKey === "extend"}
            >
              期限を延長する（+1{billingCycleLabel === "年払い" ? "年" : "か月"}）
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>有効期限を延長しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                継続分の入金を確認したら押してください。現在の有効期限（{periodEndLabel}）の翌日から
                {billingCycleLabel === "年払い" ? "1年" : "1か月"}延長されます。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={handleExtend} disabled={isPending}>
                延長する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* プラン変更 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={targetPlan} onValueChange={(v) => setTargetPlan(v as PaidPlanType)}>
          <SelectTrigger className="w-full bg-background sm:w-60" aria-label="変更後のプラン">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAID_PLAN_TYPES.map((p) => (
              <SelectItem key={p} value={p}>
                {PLAN_LABELS[p]}
                {p === currentPlanType ? "（現在）" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={isPending || targetPlan === currentPlanType}
              pending={pendingKey === "plan"}
            >
              プランを変更する
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>プランを変更しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {PLAN_LABELS[currentPlanType]} → {PLAN_LABELS[targetPlan]} に即時変更します。差額の請求・返金はアプリ外で調整してください。有効期限は変わりません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={handleChangePlan} disabled={isPending}>
                変更する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* 解約 */}
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="text-body-sm font-medium text-destructive underline underline-offset-2 disabled:opacity-60"
              disabled={isPending}
            >
              この契約を解約する
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>銀行振込の契約を解約しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                即時に有料プランが終了し、掲載中の案件はすべて掲載終了になります。法人プランの場合は配下の担当者アカウントも利用できなくなります。返金はアプリ外で対応してください。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {pendingKey === "cancel" ? "解約中..." : "解約する"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
