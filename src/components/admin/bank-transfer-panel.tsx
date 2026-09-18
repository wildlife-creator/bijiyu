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
  activateBankTransferPlanAction,
  activateBankTransferVideoOptionAction,
  cancelBankSubscriptionAction,
  changeBankSubscriptionPlanAction,
  switchStripeToBankTransferAction,
} from "@/app/admin/(protected)/clients/[id]/bank-subscription-actions";
import {
  BANK_TRANSFER_PLAN_CHOICES,
  BANK_TRANSFER_VIDEO_PLAN_KEYS,
  type BankTransferVideoPlanKey,
} from "@/lib/constants/contact-options";
import {
  PAID_PLAN_TYPES,
  PLAN_LABELS,
  type PaidPlanType,
} from "@/lib/constants/plans";

export interface BankTransferPanelSubscription {
  id: string;
  planType: PaidPlanType;
  paymentMethod: "stripe" | "bank_transfer";
  status: "active" | "past_due";
  /** カード払いのときだけ表示に使う（YYYY/MM/DD）。銀行振込は期限を持たない */
  periodEndLabel: string | null;
}

/** 購入済みの動画プラン 1 件（表示専用。同じプランを複数回買えば複数行になる） */
export interface BankTransferPanelVideoPurchase {
  id: string;
  /** 正式名（VIDEO_OPTION_UI_NAMES） */
  planName: string;
  /** 購入日（YYYY/MM/DD） */
  purchasedOnLabel: string;
  /** 「クレジットカード」/「銀行振込」 */
  paymentMethodLabel: string;
}

interface BankTransferPanelProps {
  userId: string;
  /**
   * 購入済みの動画プラン（カード・銀行振込の両方、購入日の新しい順）。
   * 二重の有効化に気づけるよう、有効化ボタンの上に一覧で出す
   */
  videoPurchases: BankTransferPanelVideoPurchase[];
  /** 有効な基本プラン（active / past_due）。無ければ null */
  subscription: BankTransferPanelSubscription | null;
}

const VIDEO_CHOICES = BANK_TRANSFER_PLAN_CHOICES.filter((c) => c.kind === "video");

/**
 * ADM-009 ユーザー詳細の「銀行振込」枠。契約は会員に紐づくため、ここだけに置く
 * （ADM-004 発注者詳細には置かない）。
 * 状態で中身が切り替わる:
 * - 有料プランなし → 基本プランを「有効にする」
 * - 銀行振込で契約中 → 「変更する」「無効にする」
 * - カード払いで契約中 → 「銀行振込に切り替える」（カードはその場で停止）
 * どの状態でも動画プランを「有効にする」できる。
 * 呼び出し側は対象が contractor / client かつ退会済みでないときだけ描画する。
 */
export function BankTransferPanel({
  userId,
  videoPurchases,
  subscription,
}: BankTransferPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [planType, setPlanType] = useState<PaidPlanType>(
    subscription?.planType ?? PAID_PLAN_TYPES[0],
  );
  const [videoType, setVideoType] = useState<BankTransferVideoPlanKey>(
    BANK_TRANSFER_VIDEO_PLAN_KEYS[0],
  );

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

  function handleActivate() {
    run("activate", async () => {
      const fd = new FormData();
      fd.set("planType", planType);
      const result = await activateBankTransferPlanAction(userId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${PLAN_LABELS[planType]}を有効にしました`);
      router.refresh();
    });
  }

  function handleChangePlan() {
    if (!subscription) return;
    run("plan", async () => {
      const fd = new FormData();
      fd.set("planType", planType);
      const result = await changeBankSubscriptionPlanAction(subscription.id, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${PLAN_LABELS[planType]}に変更しました`);
      router.refresh();
    });
  }

  function handleCancel() {
    if (!subscription) return;
    run("cancel", async () => {
      const result = await cancelBankSubscriptionAction(subscription.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("無効にしました");
      router.refresh();
    });
  }

  function handleSwitch() {
    if (!subscription) return;
    run("switch", async () => {
      const fd = new FormData();
      fd.set("planType", planType);
      const result = await switchStripeToBankTransferAction(subscription.id, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`銀行振込（${PLAN_LABELS[planType]}）に切り替えました`);
      router.refresh();
    });
  }

  function handleActivateVideo() {
    run("video", async () => {
      const fd = new FormData();
      fd.set("optionType", videoType);
      const result = await activateBankTransferVideoOptionAction(userId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const label = VIDEO_CHOICES.find((c) => c.key === videoType)?.label ?? videoType;
      toast.success(`${label}を有効にしました`);
      router.refresh();
    });
  }

  const isBank = subscription?.paymentMethod === "bank_transfer";
  const isStripe = subscription?.paymentMethod === "stripe";

  return (
    <div className="mt-3 space-y-5 rounded-[8px] border border-border/20 bg-background p-4">
      {/* ---- 基本プラン ---- */}
      <div className="space-y-3">
        <p className="text-body-sm font-bold text-foreground">
          基本プラン
          {isBank && subscription && (
            <span className="ml-2 font-normal text-muted-foreground">
              現在: {PLAN_LABELS[subscription.planType]}（銀行振込）
            </span>
          )}
          {isStripe && subscription && (
            <span className="ml-2 font-normal text-muted-foreground">
              現在: {PLAN_LABELS[subscription.planType]}（クレジットカード
              {subscription.periodEndLabel ? `・期間終了日 ${subscription.periodEndLabel}` : ""}）
            </span>
          )}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={planType} onValueChange={(v) => v && setPlanType(v as PaidPlanType)}>
            <SelectTrigger
              id="bt-plan"
              className="w-full bg-background sm:w-60"
              aria-label="基本プラン"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAID_PLAN_TYPES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLAN_LABELS[p]}
                  {isBank && p === subscription?.planType ? "（現在）" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!subscription && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  className="rounded-full text-white"
                  disabled={isPending}
                  pending={pendingKey === "activate"}
                >
                  有効にする
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>銀行振込でプランを有効にしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    入金を確認したうえで有効化してください。{PLAN_LABELS[planType]}
                    の有料会員に切り替わり、本人に有効化メールが届きます。期限は管理しません（無効にするまで有効）。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
                  <AlertDialogAction type="button" onClick={handleActivate} disabled={isPending}>
                    有効にする
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isBank && subscription && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={isPending || planType === subscription.planType}
                  pending={pendingKey === "plan"}
                >
                  変更する
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>プランを変更しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    {PLAN_LABELS[subscription.planType]} → {PLAN_LABELS[planType]}{" "}
                    に即時変更します。差額の請求・返金はアプリ外で調整してください。
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
          )}

          {isStripe && subscription && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  className="rounded-full text-white"
                  disabled={isPending}
                  pending={pendingKey === "switch"}
                >
                  銀行振込に切り替える
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>銀行振込に切り替えますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    クレジットカード払いはこの時点で停止します（残り期間の日割り返金はありません。以降の請求は銀行振込）。
                    契約は途切れず、{PLAN_LABELS[planType]}の銀行振込契約になります。案件・担当者はそのままです。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
                  <AlertDialogAction type="button" onClick={handleSwitch} disabled={isPending}>
                    切り替える
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {isBank && subscription && (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="text-body-sm font-medium text-destructive underline underline-offset-2 disabled:opacity-60"
                  disabled={isPending}
                >
                  無効にする
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>銀行振込の契約を無効にしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    即時に有料プランが終了し、掲載中の案件はすべて掲載終了になります。プレミアム・ハイエンドプランの場合は配下の担当者アカウントも利用できなくなります。返金はアプリ外で対応してください。この操作は取り消せません。
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
                    {pendingKey === "cancel" ? "無効化中..." : "無効にする"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* ---- 動画プラン ---- */}
      <div className="space-y-3 border-t border-border/20 pt-4">
        <p className="text-body-sm font-bold text-foreground">動画プラン</p>
        <div className="text-body-sm">
          <p className="text-muted-foreground">購入済み:</p>
          {videoPurchases.length === 0 ? (
            <p className="pl-3 text-muted-foreground">なし</p>
          ) : (
            <ul className="space-y-1 pl-3">
              {videoPurchases.map((v) => (
                <li key={v.id} className="flex flex-wrap gap-x-3 text-foreground">
                  <span>・{v.planName}</span>
                  <span className="text-muted-foreground">
                    {v.purchasedOnLabel}（{v.paymentMethodLabel}）
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={videoType}
            onValueChange={(v) => v && setVideoType(v as BankTransferVideoPlanKey)}
          >
            <SelectTrigger
              id="bt-video"
              className="w-full bg-background sm:w-72"
              aria-label="動画プラン"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_CHOICES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
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
                disabled={isPending}
                pending={pendingKey === "video"}
              >
                動画プランを有効にする
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>動画プランを有効にしますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  入金を確認したうえで有効化してください。購入記録が作られ、本人と運営に購入完了メールが届きます。既に購入済みでも作り直し（再購入）として有効化できます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
                <AlertDialogAction type="button" onClick={handleActivateVideo} disabled={isPending}>
                  有効にする
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
