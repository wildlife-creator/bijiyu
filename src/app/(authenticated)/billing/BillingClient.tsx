"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BILLING_CYCLE_LABELS,
  INITIAL_FEE_TAX_INCLUDED,
  planDisplayName,
  type BillingCycle,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import { BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE } from "@/lib/billing/bank-transfer";
import {
  VIDEO_OPTION_TYPES,
  VIDEO_OPTION_UI_NAMES,
  type VideoOptionType,
} from "@/lib/billing/options";
import { startCheckoutAction } from "./actions";
import {
  changePlanAction,
  cancelDowngradeReservationAction,
  scheduleCancelAction,
  cancelImmediatelyAction,
  cancelCompensationAction,
  openCustomerPortalAction,
} from "./plan-actions";
import { BankTransferContactNote, formatDate, formatPrice, VideoOptionRow } from "./billing-parts";
import { BillingDialogs, type BillingDialogType } from "./billing-dialogs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PlanState {
  planType: PaidPlanType;
  billingCycle: BillingCycle;
  label: string;
  price: number;
  isCurrent: boolean;
  isPastDue: boolean;
  comparison: "upgrade" | "downgrade" | "same";
  buttonLabel: string;
  buttonDisabled: boolean;
  buttonAction: "checkout" | "change" | "none";
  disabledReason: string | null;
}

interface SubscriptionInfo {
  scheduleId: string | null;
  scheduledPlanType: string | null;
  scheduledBillingCycle: BillingCycle | null;
  scheduledAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
}

/**
 * 買い切り動画系オプションの画面上の商品名（料金プラン画面・再購入ダイアログ用）。
 * メール用の OPTION_LABELS（短縮名）とは別に、この画面の見出しに合わせる。
 */
interface ActiveOption {
  id: string;
  optionType: string;
  jobId: string | null;
  stripeSubscriptionId: string | null;
  endDate: string | null;
  /** 購入日（start_date ?? created_at）。オプション欄の「購入済み」表示用 */
  purchasedAt: string;
}

interface BankTransferInfo {
  /**
   * 現在の有料プランが銀行振込契約か。変更・無効化は運営が管理画面で行う。
   * カード払いへの切り替えは本画面の「カード払いで申し込む」（Checkout 完了で銀行振込は自動終了）
   */
  isBankTransferPlan: boolean;
}

interface BillingClientProps {
  isStaff: boolean;
  isPastDue: boolean;
  hasReservation: boolean;
  currentPlan: PlanType;
  /** 現在の支払サイクル（無料プランは monthly） */
  currentCycle: BillingCycle;
  subscription: SubscriptionInfo | null;
  /** 月払い / 年払い それぞれのボタン状態 */
  planStatesByCycle: Record<BillingCycle, PlanState[]>;
  showInitialFee: boolean;
  activeOptions: ActiveOption[];
  urgentEligibleJobs: Array<{ id: string; title: string }>;
  checkoutSuccess?: string;
  /** 補償オプションの販売フラグ（false = 販売停止。加入中の行だけ解約用に出す） */
  compensationOptionEnabled: boolean;
  /** Stripe ホスト画面でプラン変更を確定して戻ってきた */
  planChangeConfirmed?: boolean;
  bankTransfer: BankTransferInfo;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingClient({
  isStaff,
  isPastDue,
  hasReservation,
  currentPlan,
  currentCycle,
  subscription,
  planStatesByCycle,
  showInitialFee,
  activeOptions,
  urgentEligibleJobs,
  checkoutSuccess,
  compensationOptionEnabled,
  planChangeConfirmed = false,
  bankTransfer,
}: BillingClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 押したボタンにだけスピナーを出すためのキー。全ボタンが同じ pending を
  // 共有するため、これが無いと処理中に全ボタンが同時にスピナー表示になる。
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function runPending(key: string, fn: () => Promise<void>) {
    setPendingKey(key);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingKey(null);
      }
    });
  }

  // 補償オプションの active 状態は option_subscriptions（active なレコード）
  // 単独で判定する（client_profiles のフラグカラムは廃止済み）。
  const hasComp5000 = activeOptions.some(
    (o) => o.optionType === "compensation_5000",
  );
  const hasComp9800 = activeOptions.some(
    (o) => o.optionType === "compensation_9800",
  );

  // 動画オプションは買い切りだが「作り直しのための再購入」が正当にありうるため、
  // 購入済みならボタンを「再度購入する」にして活性のまま、押下時に再購入確認ダイアログを挟む。
  // 全会員（staff 以外）が購入可。発注者プランの加入は問わない。
  // プレミアム・ハイエンドへの付属はアプリで判定せず、説明文の注意書きで案内する（運用対応）。
  const hasVideoOption: Record<VideoOptionType, boolean> = {
    video: activeOptions.some((o) => o.optionType === "video"),
    video_shooting: activeOptions.some(
      (o) => o.optionType === "video_shooting",
    ),
    video_sns: activeOptions.some((o) => o.optionType === "video_sns"),
  };

  // 月払い / 年払いの表示切替。既定は現在の契約サイクル（無料は月払い）
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(currentCycle);
  const planStates = planStatesByCycle[selectedCycle];

  // 銀行振込
  const { isBankTransferPlan } = bankTransfer;

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<BillingDialogType | null>(null);
  const [dialogTarget, setDialogTarget] = useState<PaidPlanType | null>(null);
  const [dialogTargetCycle, setDialogTargetCycle] = useState<BillingCycle>("monthly");
  const [cancelCompId, setCancelCompId] = useState<string | null>(null);
  const [repurchaseOption, setRepurchaseOption] =
    useState<VideoOptionType | null>(null);

  // Urgent option state
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // Stripe ホスト画面からの戻り（確定はメールと画面の再描画で確認できる）
  useEffect(() => {
    if (planChangeConfirmed) {
      toast.success("プラン変更を受け付けました。反映まで少しお待ちください");
      router.replace("/billing");
    }
  }, [planChangeConfirmed, router]);

  // Show checkout success toast
  useEffect(() => {
    if (checkoutSuccess === "plan") {
      toast.success("有料プランへの登録が完了しました");
      router.replace("/billing");
    } else if (checkoutSuccess === "compensation") {
      toast.success("補償オプションのお申し込みが完了しました");
      router.replace("/billing");
    } else if (checkoutSuccess === "urgent") {
      toast.success("急募オプションのお申し込みが完了しました");
      router.replace("/billing");
    } else if (checkoutSuccess === "video") {
      toast.success("プロフィール動画制作プランのお申し込みが完了しました");
      router.replace("/billing");
    } else if (checkoutSuccess === "video_shooting") {
      toast.success("ユーザー撮影動画制作プランのお申し込みが完了しました");
      router.replace("/billing");
    } else if (checkoutSuccess === "video_sns") {
      toast.success("ビジ友公式SNS動画制作プランのお申し込みが完了しました");
      router.replace("/billing");
    }
  }, [checkoutSuccess, router]);

  // --- Action handlers ---

  function handlePlanButton(plan: PlanState) {
    if (plan.buttonAction === "checkout") {
      runPending(`plan-${plan.planType}`, async () => {
        const result = await startCheckoutAction({
          type: "plan",
          planType: plan.planType,
          billingCycle: plan.billingCycle,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        if (result.data?.checkoutUrl) {
          window.location.href = result.data.checkoutUrl;
        }
      });
    } else if (plan.buttonAction === "change") {
      // 向き（アップグレード / ダウングレード）はサーバー側で算出済み（プラン + サイクル）
      setDialogType(plan.comparison === "upgrade" ? "upgrade" : "downgrade");
      setDialogTarget(plan.planType);
      setDialogTargetCycle(plan.billingCycle);
      setDialogOpen(true);
    }
  }

  function handleDialogConfirm() {
    if (!dialogTarget) return;
    setDialogOpen(false);
    runPending("dialog", async () => {
      const result = await changePlanAction({
        targetPlan: dialogTarget,
        targetCycle: dialogTargetCycle,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.performedType === "upgrade") {
        // アップグレードは Stripe のホスト画面で確定する（日割り差額・次回請求を Stripe が表示）。
        // 確定後は /billing?plan_change=confirmed に戻り、DB 更新とメールは Webhook が行う
        window.location.href = result.data.portalUrl;
        return;
      } else if (result.data?.performedType === "downgrade") {
        toast.success(
          `${formatDate(result.data.scheduledAt)}に${result.data.newPlanName}への変更を予約しました`,
        );
      }
      router.refresh();
    });
  }

  function handleCancelReservation() {
    runPending("cancel-reservation", async () => {
      const result = await cancelDowngradeReservationAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.cancelledType === "downgrade") {
        toast.success("ダウングレード予約を取り消しました");
      } else {
        toast.success("解約予定を取り消しました");
      }
      router.refresh();
    });
  }

  function handleScheduleCancel() {
    setDialogType("cancel");
    setDialogTarget(null);
    setDialogOpen(true);
  }

  function handleScheduleCancelConfirm() {
    setDialogOpen(false);
    runPending("dialog", async () => {
      const result = await scheduleCancelAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("解約予約が完了しました");
      router.refresh();
    });
  }

  function handleCancelImmediately() {
    setDialogType("cancel_past_due");
    setDialogTarget(null);
    setDialogOpen(true);
  }

  function handleCancelImmediatelyConfirm() {
    setDialogOpen(false);
    runPending("dialog", async () => {
      const result = await cancelImmediatelyAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("解約が完了しました");
      router.push("/mypage");
    });
  }

  function handleOpenPortal() {
    runPending("portal", async () => {
      const result = await openCustomerPortalAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.portalUrl) {
        window.location.href = result.data.portalUrl;
      }
    });
  }

  function handleOptionCheckout(
    optionType:
      | "compensation_5000"
      | "compensation_9800"
      | "urgent"
      | VideoOptionType,
    jobId?: string,
  ) {
    runPending(`opt-${optionType}`, async () => {
      const input =
        optionType === "urgent" && jobId
          ? { type: "option" as const, optionType, jobId }
          : optionType === "compensation_5000" || optionType === "compensation_9800"
            ? { type: "option" as const, optionType }
            : {
                type: "option" as const,
                optionType: optionType as VideoOptionType,
              };
      const result = await startCheckoutAction(input);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.checkoutUrl) {
        window.location.href = result.data.checkoutUrl;
      }
    });
  }

  function handleVideoOptionButton(optionType: VideoOptionType) {
    const purchased = hasVideoOption[optionType];
    if (!purchased) {
      handleOptionCheckout(optionType);
      return;
    }
    setRepurchaseOption(optionType);
    setDialogType("repurchase_video");
    setDialogOpen(true);
  }

  function handleRepurchaseConfirm() {
    if (!repurchaseOption) return;
    setDialogOpen(false);
    handleOptionCheckout(repurchaseOption);
  }

  function handleCancelCompensation(optId: string) {
    setCancelCompId(optId);
    setDialogType("cancel_comp");
    setDialogOpen(true);
  }

  function handleCancelCompensationConfirm() {
    if (!cancelCompId) return;
    setDialogOpen(false);
    runPending("dialog", async () => {
      const result = await cancelCompensationAction({
        optionSubscriptionId: cancelCompId!,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("補償オプションを解約しました");
      router.refresh();
    });
  }

  // 動画プランの購入履歴（オプション欄の「購入済み」。買い切りなので複数行ありうる）
  const purchasedVideoOptions = activeOptions
    .filter((o): o is ActiveOption & { optionType: VideoOptionType } =>
      (VIDEO_OPTION_TYPES as readonly string[]).includes(o.optionType),
    )
    .sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1));

  const priceUnit = (cycle: BillingCycle) => (cycle === "yearly" ? "年" : "月");
  const isFree = currentPlan === "free";

  return (
    <>
      <h1 className="text-center text-heading-lg font-bold text-secondary">料金プラン</h1>

      {/* staff 制限メッセージ */}
      {isStaff && (
        <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-body-sm text-yellow-800">
          担当者アカウントではプランの変更はできません。組織の管理者にお問い合わせください。
        </div>
      )}

      {/* ===== ご契約状況（今の契約・支払い方法・更新日・予約と、契約に対する操作をここに集約） ===== */}
      <section className="mt-6 rounded-lg border border-border bg-background p-5">
        <h2 className="text-heading-sm font-bold">ご契約状況</h2>

        {isFree ? (
          <div className="mt-3 space-y-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
              <dt className="text-muted-foreground">プラン</dt>
              <dd className="font-medium">無料プラン</dd>
            </dl>
            <p className="text-body-sm text-muted-foreground">
              有料プランに申し込むと、案件の掲載や職人の検索が使えるようになります。
            </p>
            {/* 初回だけ事務手数料の注意書き。再契約・切り替え時の「不要」の文は紛らわしいため出さない
                （手数料の要否はサーバー側が契約歴で判定する。表示は案内のみ） */}
            {showInitialFee && (
              <p className="text-body-sm text-muted-foreground">
                ※初めて有料プランへ申し込む場合、初回事務手数料として{INITIAL_FEE_TAX_INCLUDED.toLocaleString("ja-JP")}円が必要となります。
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-body-sm">
              <dt className="text-muted-foreground">プラン</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium">
                {planDisplayName(currentPlan)}
                <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                  ご利用中
                </Badge>
                {isPastDue && (
                  <Badge variant="destructive" className="text-xs">
                    お支払い確認中
                  </Badge>
                )}
              </dd>
              <dt className="text-muted-foreground">お支払い方法</dt>
              <dd className="font-medium">
                {isBankTransferPlan
                  ? "銀行振込"
                  : `クレジットカード・${BILLING_CYCLE_LABELS[currentCycle]}`}
              </dd>
              {!isBankTransferPlan && subscription?.currentPeriodEnd && (
                <>
                  <dt className="text-muted-foreground">次回更新日</dt>
                  <dd className="font-medium">{formatDate(subscription.currentPeriodEnd)}</dd>
                </>
              )}
            </dl>

            {/* 支払い遅延 */}
            {isPastDue && !isStaff && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body-sm text-destructive">
                お支払いが完了していません。お支払い方法を更新するか、解約をお選びください。
              </div>
            )}

            {/* ダウングレード予約 */}
            {subscription?.scheduledPlanType && subscription.scheduleId && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-body-sm">
                <Badge variant="outline" className="border-amber-500 bg-amber-50 text-xs text-amber-800">
                  変更予定
                </Badge>
                <span className="ml-2">
                  {formatDate(subscription.scheduledAt)}に
                  {planDisplayName(
                    (subscription.scheduledPlanType as PlanType) ?? "free",
                    subscription.scheduledBillingCycle ?? currentCycle,
                  )}
                  に変更予定
                </span>
              </div>
            )}

            {/* 解約予約 */}
            {subscription?.cancelAtPeriodEnd && !subscription.scheduleId && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-body-sm">
                <Badge variant="outline" className="border-amber-500 bg-amber-50 text-xs text-amber-800">
                  解約予定
                </Badge>
                <span className="ml-2">{formatDate(subscription.currentPeriodEnd)}に解約予定</span>
              </div>
            )}

            {/* 銀行振込: 変更・停止は運営。カードへの切り替えは基本プラン欄のボタンから */}
            {isBankTransferPlan && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-body-sm text-muted-foreground">
                {BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE}
                <br />
                クレジットカード払いへ切り替える場合は、下の基本プランから「カード払いにする」を選んでください。
              </div>
            )}

            {/* 契約に対する操作（Stripe 契約のみ。担当者は操作不可） */}
            {!isStaff && !isBankTransferPlan && (
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <Button
                  variant="outline"
                  className="rounded-full text-primary border-primary/50"
                  disabled={pending}
                  pending={pendingKey === "portal"}
                  onClick={handleOpenPortal}
                >
                  お支払い情報を管理する
                </Button>
                {isPastDue ? (
                  <Button
                    variant="destructive"
                    className="rounded-full"
                    disabled={pending}
                    onClick={handleCancelImmediately}
                  >
                    即時解約する
                  </Button>
                ) : subscription?.scheduleId && subscription.scheduledPlanType ? (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={pending}
                    pending={pendingKey === "cancel-reservation"}
                    onClick={handleCancelReservation}
                  >
                    変更をキャンセルする
                  </Button>
                ) : subscription?.cancelAtPeriodEnd ? (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={pending}
                    pending={pendingKey === "cancel-reservation"}
                    onClick={handleCancelReservation}
                  >
                    解約をキャンセルする
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="rounded-full text-destructive border-destructive/50"
                    disabled={pending}
                    onClick={handleScheduleCancel}
                  >
                    解約する
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== 基本プラン（どの状態でも同じ形。行のボタンは 1 種類） ===== */}
      <section className="mt-6 rounded-lg border border-border bg-background p-5">
        <h2 className="text-heading-sm font-bold">基本プラン</h2>
        <p className="mt-3 text-body-sm text-muted-foreground">
          各プランでできることは<a href="/billing/plans" className="text-primary underline">プラン比較表</a>をご覧ください。
        </p>

        {/* 月払い / 年払い 切替 */}
        <div
          className="mt-4 inline-flex w-full rounded-full border border-border bg-muted/40 p-1 text-body-sm"
          role="tablist"
          aria-label="お支払いサイクル"
        >
          {(["monthly", "yearly"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              role="tab"
              aria-selected={selectedCycle === cycle}
              onClick={() => setSelectedCycle(cycle)}
              className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${
                selectedCycle === cycle
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {BILLING_CYCLE_LABELS[cycle]}
            </button>
          ))}
        </div>
        {!isFree && !isBankTransferPlan && (
          <p className="mt-2 text-body-xs text-muted-foreground">
            月払い → 年払いは即時、年払い → 月払いは次回更新日に切り替わります。
          </p>
        )}
        {hasReservation && !isPastDue && (
          <p className="mt-2 text-body-xs text-muted-foreground">
            変更予定がある間は他のプランを選べません。先に「ご契約状況」の予約をキャンセルしてください。
          </p>
        )}

        <div className="mt-4 divide-y divide-border">
          {planStates.map((plan) => (
            <div key={`${plan.planType}-${plan.billingCycle}`} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-body-md font-bold">{plan.label}</span>
                <span className="text-body-md">
                  {formatPrice(plan.price)}円/{priceUnit(plan.billingCycle)}
                </span>
              </div>

              {plan.isCurrent && !isBankTransferPlan ? (
                <div className="mt-2 text-center">
                  <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                    ご利用中
                  </Badge>
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-2">
                  {plan.isCurrent && (
                    <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                      ご利用中
                    </Badge>
                  )}
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={plan.buttonDisabled || pending}
                    pending={pendingKey === `plan-${plan.planType}`}
                    onClick={() => handlePlanButton(plan)}
                    title={plan.disabledReason ?? undefined}
                  >
                    {formatPrice(plan.price)}円/{priceUnit(plan.billingCycle)} {plan.buttonLabel}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== オプションプラン（購入済み → 動画 3 つ → 急募 → 補償（販売停止中は加入者のみ）） ===== */}
      <section className="mt-6 rounded-lg border border-border bg-background p-5">
        <h2 className="text-heading-sm font-bold">オプションプラン</h2>

        {purchasedVideoOptions.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-body-sm">
            <p className="font-bold">購入済み</p>
            <ul className="mt-1 space-y-0.5">
              {purchasedVideoOptions.map((o) => (
                <li key={o.id}>
                  {VIDEO_OPTION_UI_NAMES[o.optionType]}（{formatDate(o.purchasedAt)}）
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">
              制作の進め方は運営からご連絡します。作り直しのために同じプランを再度購入することもできます。
            </p>
          </div>
        )}

        <div className="mt-3 divide-y divide-border">
          <VideoOptionRow
            optionType="video"
            price="100,000円/動画"
            summary="ビジ友のスタッフが撮影・編集し、あなたや会社を紹介する動画を制作します。"
            details={
              <>
                ご希望に応じてビジ友のユーザー詳細や発注者詳細のページに掲載することができます。<br />
                ※エリアにより交通費等が発生する場合があります。<br />
                ※プレミアム・ハイエンドプランの方は本プランが含まれていますので、お申し込みは不要です（2本目以降をご希望の場合はお申し込みください）。
              </>
            }
            purchased={hasVideoOption.video}
            disabled={pending || isStaff}
            pending={pendingKey === "opt-video"}
            onClick={() => handleVideoOptionButton("video")}
          />
          <VideoOptionRow
            optionType="video_shooting"
            price="20,000円/動画"
            summary="ご自身で撮影した動画をビジ友運営が編集して掲載します。"
            details={
              <>
                ご希望に応じてビジ友のユーザー詳細や発注者詳細のページに掲載することができます。<br />
                ※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。
              </>
            }
            purchased={hasVideoOption.video_shooting}
            disabled={pending || isStaff}
            pending={pendingKey === "opt-video_shooting"}
            onClick={() => handleVideoOptionButton("video_shooting")}
          />
          <VideoOptionRow
            optionType="video_sns"
            price="120,000円/動画"
            summary="ビジ友のスタッフが撮影・編集し、ビジ友の公式SNSで紹介する動画を制作します。"
            details={
              <>
                ※エリアにより交通費等が発生する場合があります。<br />
                ※プレミアム・ハイエンドプランを年払いでご利用の方は本プランが含まれていますので、お申し込みは不要です。
              </>
            }
            purchased={hasVideoOption.video_sns}
            disabled={pending || isStaff}
            pending={pendingKey === "opt-video_sns"}
            onClick={() => handleVideoOptionButton("video_sns")}
          />

          {/* 急募（案件を掲載できる有料プランの方だけ操作できる。価格と説明は誰にでも見せる） */}
          <div className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">急募</span>
              <span className="text-body-md">20,000円（7日間）</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              掲載中の案件を7日間、募集一覧の最上位に表示し、「急募」のタグを付けます。
            </p>
            {isFree ? (
              <p className="mt-2 text-body-sm text-muted-foreground">
                案件を掲載できる有料プランの方がお申し込みいただけます。
              </p>
            ) : urgentEligibleJobs.length === 0 ? (
              <p className="mt-2 text-body-sm text-muted-foreground">
                掲載中の案件がありません
              </p>
            ) : (
              <>
                <div className="mt-3">
                  <Select
                    value={selectedJobId}
                    onValueChange={setSelectedJobId}
                    disabled={isStaff}
                  >
                    <SelectTrigger className="w-full bg-background">
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
                </div>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={!selectedJobId || pending || isStaff}
                    pending={pendingKey === "opt-urgent"}
                    onClick={() =>
                      handleOptionCheckout("urgent", selectedJobId)
                    }
                  >
                    急募を申し込む
                  </Button>
                </div>
              </>
            )}
          </div>
          {/* 補償 ¥5,000/月（受注者向け 報酬未払い保険）
              販売停止中は加入中の人にだけ行を出す（解約のみ。新規申込ボタンは出さない） */}
          {(compensationOptionEnabled || hasComp5000) && (
          <div className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">補償（受注者向け）</span>
              <span className="text-body-md">5,000円/月</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              現場での報酬未払いトラブル発生時、最大200万円までを補償します。
            </p>
            {hasComp5000 && (
              <div className="mt-2">
                <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                  ご利用中
                </Badge>
              </div>
            )}
            <div className="mt-3 flex justify-center">
              {hasComp5000 ? (
                <Button
                  variant="outline"
                  className="w-full max-w-xs rounded-full text-destructive border-destructive/50"
                  disabled={pending || isStaff}
                  onClick={() => {
                    const opt = activeOptions.find(
                      (o) => o.optionType === "compensation_5000",
                    );
                    if (opt) handleCancelCompensation(opt.id);
                  }}
                >
                  解約する
                </Button>
              ) : (
                <div className="flex w-full flex-col items-center gap-2">
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={hasComp9800 || pending || isStaff}
                    pending={pendingKey === "opt-compensation_5000"}
                    onClick={() => handleOptionCheckout("compensation_5000")}
                  >
                    補償（5,000円）を申し込む
                  </Button>
                </div>
              )}
            </div>
          </div>
          )}

          {/* 補償 ¥9,800/月（受注者向け 報酬未払い保険）同上 */}
          {(compensationOptionEnabled || hasComp9800) && (
          <div className="py-4 last:pb-0">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">補償（受注者向け）</span>
              <span className="text-body-md">9,800円/月</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              現場での報酬未払いトラブル発生時、最大500万円までを補償します。
            </p>
            {hasComp9800 && (
              <div className="mt-2">
                <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                  ご利用中
                </Badge>
              </div>
            )}
            <div className="mt-3 flex justify-center">
              {hasComp9800 ? (
                <Button
                  variant="outline"
                  className="w-full max-w-xs rounded-full text-destructive border-destructive/50"
                  disabled={pending || isStaff}
                  onClick={() => {
                    const opt = activeOptions.find(
                      (o) => o.optionType === "compensation_9800",
                    );
                    if (opt) handleCancelCompensation(opt.id);
                  }}
                >
                  解約する
                </Button>
              ) : (
                <div className="flex w-full flex-col items-center gap-2">
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={hasComp5000 || pending || isStaff}
                    pending={pendingKey === "opt-compensation_9800"}
                    onClick={() => handleOptionCheckout("compensation_9800")}
                  >
                    補償（9,800円）を申し込む
                  </Button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </section>

      {!isStaff && <BankTransferContactNote />}

      {/* もどる */}
      <div className="mt-8 flex justify-center">
        <Button
          variant="outline"
          className="w-full max-w-xs rounded-full"
          onClick={() => router.back()}
        >
          もどる
        </Button>
      </div>

      <BillingDialogs
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        dialogType={dialogType}
        targetPlan={dialogTarget}
        targetCycle={dialogTargetCycle}
        repurchaseOption={repurchaseOption}
        currentPlan={currentPlan}
        currentCycle={currentCycle}
        currentPeriodEnd={subscription?.currentPeriodEnd}
        hasCompensation={hasComp5000 || hasComp9800}
        pending={pending}
        pendingKey={pendingKey}
        onConfirmPlanChange={handleDialogConfirm}
        onConfirmScheduleCancel={handleScheduleCancelConfirm}
        onConfirmCancelImmediately={handleCancelImmediatelyConfirm}
        onOpenPortal={handleOpenPortal}
        onConfirmRepurchase={handleRepurchaseConfirm}
        onConfirmCancelCompensation={handleCancelCompensationConfirm}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 動画プランの 1 行（価格 + 1 行の説明 + 「詳しく見る」でたたむ注意書き + ボタン）
// ---------------------------------------------------------------------------
