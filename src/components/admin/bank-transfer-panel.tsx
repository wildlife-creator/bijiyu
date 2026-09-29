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
  activateBankTransferUrgentOptionAction,
  activateBankTransferVideoOptionAction,
  cancelBankSubscriptionAction,
  changeBankSubscriptionPlanAction,
  switchStripeToBankTransferAction,
} from "@/app/admin/(protected)/clients/[id]/bank-subscription-actions";
import {
  BANK_TRANSFER_VIDEO_CHOICES,
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

/** 適用中の急募 1 件（表示専用。カード・銀行振込の両方） */
export interface BankTransferPanelUrgentOption {
  id: string;
  jobTitle: string;
  /** 期限（YYYY/MM/DD） */
  endDateLabel: string;
  /** 「クレジットカード」/「銀行振込」 */
  paymentMethodLabel: string;
}

/** 急募を付けられる案件（本人または同じ組織の掲載中で、急募になっていないもの） */
export interface BankTransferPanelEligibleJob {
  id: string;
  title: string;
}

interface BankTransferPanelProps {
  userId: string;
  /**
   * 購入済みの動画プラン（カード・銀行振込の両方、購入日の新しい順）。
   * 二重の有効化に気づけるよう、有効化ボタンの上に一覧で出す
   */
  videoPurchases: BankTransferPanelVideoPurchase[];
  /** 適用中の急募（案件名 + 期限。カード・銀行振込の両方） */
  urgentOptions: BankTransferPanelUrgentOption[];
  /** 急募を付けられる案件（/billing の急募プルダウンと同じ絞り込み） */
  urgentEligibleJobs: BankTransferPanelEligibleJob[];
  /** 有効な基本プラン（active / past_due）。無ければ null */
  subscription: BankTransferPanelSubscription | null;
}


/**
 * ADM-009 ユーザー詳細の「契約内容」枠。契約は会員に紐づくため、ここだけに置く
 * （ADM-004 発注者詳細には置かない）。
 * 運営が手動でオンにする枠（payment_method = bank_transfer）。入金の有無は問わない
 * （銀行振込のほか、運営がサービスとして無料で提供する場合も同じ操作）ため、画面では
 * 「銀行振込」と書かず「手動設定」と出す。カード払いだけは「クレジットカード」と明示する。
 * 状態で中身が切り替わる:
 * - 有料プランなし → 基本プランを「有効にする」
 * - 手動設定で契約中 → 「変更する」「無効にする」
 * - カード払いで契約中 → 「手動設定に切り替える」（カードはその場で停止）
 * どの状態でも動画プランを「購入済みにする」（購入記録 + 申込受付メール）できる。
 * 急募オプションは案件を選んで「急募を有効にする」（案件に急募タグ・7 日で自動解除・お知らせメール）。
 * 呼び出し側は対象が contractor / client かつ退会済みでないときだけ描画する。
 */
export function BankTransferPanel({
  userId,
  videoPurchases,
  urgentOptions,
  urgentEligibleJobs,
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
  const [urgentJobId, setUrgentJobId] = useState<string>("");

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
      toast.success(`手動設定（${PLAN_LABELS[planType]}）に切り替えました`);
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
      const label = BANK_TRANSFER_VIDEO_CHOICES.find((c) => c.key === videoType)?.label ?? videoType;
      toast.success(`${label}を購入済みにしました`);
      router.refresh();
    });
  }

  function handleActivateUrgent() {
    if (!urgentJobId) return;
    run("urgent", async () => {
      const fd = new FormData();
      fd.set("jobId", urgentJobId);
      const result = await activateBankTransferUrgentOptionAction(userId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("急募オプションを有効にしました");
      setUrgentJobId("");
      router.refresh();
    });
  }

  const selectedUrgentJob = urgentEligibleJobs.find((j) => j.id === urgentJobId) ?? null;

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
              現在: {PLAN_LABELS[subscription.planType]}（手動設定）
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
                  <AlertDialogTitle>手動設定でプランを有効にしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    {PLAN_LABELS[planType]}
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
                  手動設定に切り替える
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>手動設定に切り替えますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    クレジットカード払いはこの時点で停止します（残り期間の日割り返金はありません）。
                    契約は途切れず、{PLAN_LABELS[planType]}の手動設定の契約になります。案件・担当者はそのままです。
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
                  <AlertDialogTitle>手動設定の契約を無効にしますか？</AlertDialogTitle>
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
              {BANK_TRANSFER_VIDEO_CHOICES.map((c) => (
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
                購入済みにする
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>動画プランを購入済みにしますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  購入記録を作り、本人と運営にお申し込み受付のメールを送ります。動画の掲載は別途
                  ADM-027（動画管理）で行います。既に購入済みでも、2本目以降（再購入）として記録できます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
                <AlertDialogAction type="button" onClick={handleActivateVideo} disabled={isPending}>
                  購入済みにする
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ---- 急募オプション（案件単位。運営が案件を選ぶ） ---- */}
      <div className="space-y-3 border-t border-border/20 pt-4">
        <p className="text-body-sm font-bold text-foreground">急募オプション</p>
        <div className="text-body-sm">
          <p className="text-muted-foreground">適用中:</p>
          {urgentOptions.length === 0 ? (
            <p className="pl-3 text-muted-foreground">なし</p>
          ) : (
            <ul className="space-y-1 pl-3">
              {urgentOptions.map((u) => (
                <li key={u.id} className="flex flex-wrap gap-x-3 text-foreground">
                  <span>・{u.jobTitle}</span>
                  <span className="text-muted-foreground">
                    {u.endDateLabel} まで（{u.paymentMethodLabel}）
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {urgentEligibleJobs.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            急募にできる案件がありません（掲載中で、まだ急募になっていない案件だけが対象です）。
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={urgentJobId} onValueChange={(v) => v && setUrgentJobId(v)}>
              <SelectTrigger
                id="bt-urgent-job"
                className="w-full bg-background sm:w-96"
                aria-label="急募にする案件"
              >
                <SelectValue placeholder="案件を選択" />
              </SelectTrigger>
              <SelectContent>
                {urgentEligibleJobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
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
                  disabled={isPending || !selectedUrgentJob}
                  pending={pendingKey === "urgent"}
                >
                  急募を有効にする
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>急募オプションを有効にしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{selectedUrgentJob?.title ?? ""}」が今日から 7 日間、募集一覧の最上位に「急募」タグ付きで表示されます。
                    本人（法人プランは組織メンバー全員）にお知らせメールを送ります。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
                  <AlertDialogAction type="button" onClick={handleActivateUrgent} disabled={isPending}>
                    有効にする
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        <p className="text-body-sm text-muted-foreground">
          この会員（法人プランは同じ組織）の掲載中で、急募になっていない案件だけが並びます。お問い合わせの「問い合わせ詳細」に書かれた案件名と見比べて選んでください。
        </p>
      </div>
    </div>
  );
}
