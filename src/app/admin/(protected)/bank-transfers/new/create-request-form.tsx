"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OPTION_LABELS,
  OPTION_PRICES_TAX_INCLUDED,
  isSubscriptionOption,
  type OptionType,
} from "@/lib/billing/options";
import {
  BILLING_CYCLE_LABELS,
  PAID_PLAN_TYPES,
  PLAN_LABELS,
  planPriceFor,
  type BillingCycle,
  type PaidPlanType,
} from "@/lib/constants/plans";

import { createBankTransferRequestByAdminAction } from "../actions";

/** 代理登録で選べるオプション（急募は案件単位のため対象外。補償は販売フラグが有効なときのみ） */
const ADMIN_OPTION_TYPES: readonly OptionType[] = [
  "video",
  "video_workplace",
  "video_shooting",
  "compensation_5000",
  "compensation_9800",
];

interface CreateRequestFormProps {
  compensationEnabled: boolean;
}

export function CreateRequestForm({ compensationEnabled }: CreateRequestFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [targetKind, setTargetKind] = useState<"plan" | "option">("plan");
  const [planType, setPlanType] = useState<PaidPlanType>("individual");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [optionType, setOptionType] = useState<OptionType>("video");

  const optionChoices = ADMIN_OPTION_TYPES.filter(
    (t) => compensationEnabled || !isSubscriptionOption(t),
  );
  const cycleSelectable =
    targetKind === "plan" || isSubscriptionOption(optionType);

  const previewAmount =
    targetKind === "plan"
      ? planPriceFor(planType, billingCycle)
      : isSubscriptionOption(optionType)
        ? OPTION_PRICES_TAX_INCLUDED[optionType] * (billingCycle === "yearly" ? 12 : 1)
        : OPTION_PRICES_TAX_INCLUDED[optionType];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", email.trim());
    fd.set("targetKind", targetKind);
    if (targetKind === "plan") {
      fd.set("planType", planType);
      fd.set("billingCycle", billingCycle);
    } else {
      fd.set("optionType", optionType);
      if (cycleSelectable) fd.set("billingCycle", billingCycle);
    }
    startTransition(async () => {
      const result = await createBankTransferRequestByAdminAction(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data?.targetLabel ?? "申込"}を登録しました`);
      router.push(`/admin/bank-transfers/${result.data?.requestId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="bt-new-email">会員のメールアドレス</Label>
        <Input
          id="bt-new-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@example.com"
          className="bg-background"
        />
        <p className="text-body-xs text-muted-foreground">
          登録済みのメールアドレスと完全一致で検索します。担当者・管理者・退会済みの会員には登録できません。
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bt-new-target-kind">対象</Label>
        <Select
          value={targetKind}
          onValueChange={(v) => {
            if (v) setTargetKind(v as "plan" | "option");
          }}
        >
          <SelectTrigger id="bt-new-target-kind" aria-label="対象" className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plan">基本プラン</SelectItem>
            <SelectItem value="option">オプション</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {targetKind === "plan" ? (
        <div className="space-y-1.5">
          <Label htmlFor="bt-new-plan">プラン</Label>
          <Select
            value={planType}
            onValueChange={(v) => {
              if (v) setPlanType(v as PaidPlanType);
            }}
          >
            <SelectTrigger id="bt-new-plan" aria-label="プラン" className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAID_PLAN_TYPES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLAN_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="bt-new-option">オプション</Label>
          {/* Radix Select は表示切替で mount した直後に空文字の onValueChange を発火することがあるため空値は無視する */}
          <Select
            value={optionType}
            onValueChange={(v) => {
              if (v) setOptionType(v as OptionType);
            }}
          >
            <SelectTrigger id="bt-new-option" aria-label="オプション" className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionChoices.map((t) => (
                <SelectItem key={t} value={t}>
                  {OPTION_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-body-xs text-muted-foreground">
            急募オプションは案件単位のため代理登録の対象外です。
          </p>
        </div>
      )}

      {cycleSelectable && (
        <div className="space-y-1.5">
          <Label htmlFor="bt-new-cycle">お支払いサイクル</Label>
          <Select
            value={billingCycle}
            onValueChange={(v) => {
              if (v) setBillingCycle(v as BillingCycle);
            }}
          >
            <SelectTrigger id="bt-new-cycle" aria-label="お支払いサイクル" className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BILLING_CYCLE_LABELS) as BillingCycle[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {BILLING_CYCLE_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-body-sm text-muted-foreground">
        本体金額の目安: {previewAmount.toLocaleString("ja-JP")}円（税込）。
        初回事務手数料の有無は登録時に契約歴から自動判定します。
      </p>

      <div className="flex justify-center">
        <Button
          type="submit"
          className="w-full max-w-xs rounded-full text-white"
          disabled={isPending || !email.trim()}
          pending={isPending}
        >
          登録する
        </Button>
      </div>
    </form>
  );
}
