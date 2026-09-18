"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
  planPriceFor,
  type BillingCycle,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import {
  BANK_TRANSFER_CONTACT_MESSAGE,
  BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE,
} from "@/lib/billing/bank-transfer";
import { VIDEO_OPTION_UI_NAMES, type VideoOptionType } from "@/lib/billing/options";
import { startCheckoutAction } from "./actions";
import {
  changePlanAction,
  cancelDowngradeReservationAction,
  scheduleCancelAction,
  cancelImmediatelyAction,
  cancelCompensationAction,
  openCustomerPortalAction,
} from "./plan-actions";

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
 * 名称は docs/requirements/video-plans-handoff-202609.md §4.1 で確定（P10、2026-09）。
 */
interface ActiveOption {
  id: string;
  optionType: string;
  jobId: string | null;
  stripeSubscriptionId: string | null;
  endDate: string | null;
}

interface BankTransferInfo {
  /**
   * 現在の有料プランが銀行振込契約か（P12）。変更・無効化は運営が管理画面で行う。
   * カード払いへの切り替えは本画面の「カード払いで申し込む」（Checkout 完了で銀行振込は自動終了）
   */
  isBankTransferPlan: boolean;
}

interface BillingClientProps {
  isStaff: boolean;
  isPastDue: boolean;
  hasReservation: boolean;
  currentPlan: PlanType;
  /** P3: 現在の支払サイクル（無料プランは monthly） */
  currentCycle: BillingCycle;
  subscription: SubscriptionInfo | null;
  /** P3: 月払い / 年払い それぞれのボタン状態 */
  planStatesByCycle: Record<BillingCycle, PlanState[]>;
  showInitialFee: boolean;
  activeOptions: ActiveOption[];
  urgentEligibleJobs: Array<{ id: string; title: string }>;
  checkoutSuccess?: string;
  /** P8: 補償オプションの販売フラグ（false = 販売停止。加入中の行だけ解約用に出す） */
  compensationOptionEnabled: boolean;
  /** P3: Stripe ホスト画面でプラン変更を確定して戻ってきた */
  planChangeConfirmed?: boolean;
  bankTransfer: BankTransferInfo;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
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
  // 全会員（staff 以外）が購入可。発注者プランの加入は問わない（P10 で旧 職場紹介動画の制限を撤廃）。
  // プレミアム・ハイエンドへの付属はアプリで判定せず、説明文の注意書きで案内する（運用対応）。
  const hasVideoOption: Record<VideoOptionType, boolean> = {
    video: activeOptions.some((o) => o.optionType === "video"),
    video_shooting: activeOptions.some(
      (o) => o.optionType === "video_shooting",
    ),
    video_sns: activeOptions.some((o) => o.optionType === "video_sns"),
  };
  const hasVideo = hasVideoOption.video;
  const hasVideoShooting = hasVideoOption.video_shooting;
  const hasVideoSns = hasVideoOption.video_sns;

  // P3: 月払い / 年払いの表示切替。既定は現在の契約サイクル（無料は月払い）
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(currentCycle);
  const planStates = planStatesByCycle[selectedCycle];

  // 銀行振込（P12）
  const { isBankTransferPlan } = bankTransfer;

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<
    | "upgrade"
    | "downgrade"
    | "cancel"
    | "cancel_past_due"
    | "cancel_comp"
    | "repurchase_video"
    | null
  >(null);
  const [dialogTarget, setDialogTarget] = useState<PaidPlanType | null>(null);
  const [dialogTargetCycle, setDialogTargetCycle] = useState<BillingCycle>("monthly");
  const [cancelCompId, setCancelCompId] = useState<string | null>(null);
  const [repurchaseOption, setRepurchaseOption] =
    useState<VideoOptionType | null>(null);

  // Urgent option state
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // P3: Stripe ホスト画面からの戻り（確定はメールと画面の再描画で確認できる）
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
        // P3: アップグレードは Stripe のホスト画面で確定する（日割り差額・次回請求を Stripe が表示）。
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

  return (
    <>
      <h1 className="text-center text-heading-lg font-bold text-secondary">プラン変更</h1>

      {/* staff 制限メッセージ */}
      {isStaff && (
        <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-body-sm text-yellow-800">
          担当者アカウントではプランの変更はできません。組織の管理者にお問い合わせください。
        </div>
      )}

      {/* past_due 警告 */}
      {isPastDue && !isStaff && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-body-sm text-destructive">
          お支払いが完了していません。お支払い方法を更新するか、解約をお選びください。
        </div>
      )}

      {/* ===== 基本プラン セクション ===== */}
      <section className="mt-6 rounded-lg border border-border bg-background p-5 pb-8">
        <h2 className="text-heading-sm font-bold">基本プラン</h2>
        <p className="mt-3 text-body-sm text-muted-foreground">
          無料プランを含め、全部で5種類のプランがあります。各プランの詳細は<a href="/billing/plans" className="text-primary underline">こちら</a>をご確認ください。
        </p>
        {/* 初回だけ事務手数料の注意書き。再契約・切り替え時の「不要」の文は紛らわしいため出さない
            （手数料の要否はサーバー側が契約歴で判定する。表示は案内のみ） */}
        {showInitialFee && (
          <p className="mt-2 text-body-sm text-muted-foreground">
            ※基本プランの有料プランへ初めて申し込みをした場合、初回事務手数料として{INITIAL_FEE_TAX_INCLUDED.toLocaleString("ja-JP")}円が必要となります。
          </p>
        )}

        {isBankTransferPlan && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-body-sm text-muted-foreground">
            お支払い方法: 銀行振込
            <br />
            {BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE}
            <br />
            クレジットカード払いへ切り替える場合は、下の「カード払いで申し込む」からお手続きください（決済完了後、銀行振込のご契約は自動的に終了します）。
          </div>
        )}

        {/* P3: 月払い / 年払い 切替 */}
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
        {currentPlan !== "free" && (
          <p className="mt-2 text-body-xs text-muted-foreground">
            現在は{BILLING_CYCLE_LABELS[currentCycle]}でご契約中です。月払い → 年払いは即時、年払い → 月払いは次回更新日に切り替わります。
          </p>
        )}

        <div className="mt-4 divide-y divide-border">
          {planStates.map((plan) => (
            <div key={`${plan.planType}-${plan.billingCycle}`} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-body-md font-bold">{plan.label}</span>
                <span className="text-body-md">
                  {formatPrice(plan.price)}円/{plan.billingCycle === "yearly" ? "年" : "月"}
                </span>
              </div>

              {plan.isCurrent ? (
                <div className="mt-2">
                  <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                    ご利用中
                  </Badge>
                  <span className="ml-2 text-body-xs text-muted-foreground">
                    {BILLING_CYCLE_LABELS[currentCycle]}
                  </span>
                  {plan.isPastDue && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      お支払い確認中
                    </Badge>
                  )}
                  {/* 銀行振込契約中（P12）: 同じプランをカード払いに切り替える（Checkout。完了で銀行振込は自動終了） */}
                  {!isStaff && isBankTransferPlan && (
                    <div className="mt-3 flex justify-center">
                      <Button
                        variant="default"
                        className="w-full max-w-xs rounded-full text-white"
                        disabled={pending}
                        pending={pendingKey === `plan-${plan.planType}`}
                        onClick={() => handlePlanButton({ ...plan, buttonAction: "checkout" })}
                      >
                        {formatPrice(plan.price)}円/{plan.billingCycle === "yearly" ? "年" : "月"} カード払いに切り替える
                      </Button>
                    </div>
                  )}
                  {/* 解約ボタン（現在のプラン枠内）。銀行振込契約は運営が管理するため出さない */}
                  {!isStaff && !isBankTransferPlan && (
                    <div className="mt-3 flex justify-center">
                      {isPastDue ? (
                        <Button
                          variant="destructive"
                          className="w-full max-w-xs rounded-full"
                          disabled={pending}
                          onClick={handleCancelImmediately}
                        >
                          即時解約する
                        </Button>
                      ) : !hasReservation ? (
                        <Button
                          variant="outline"
                          className="w-full max-w-xs rounded-full text-destructive border-destructive/50"
                          disabled={pending}
                          onClick={handleScheduleCancel}
                        >
                          解約する
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {/* Reservation label on current plan */}
                  {subscription?.scheduledPlanType && subscription.scheduleId && (
                    <div className="mt-3 space-y-2">
                      <p className="text-body-sm text-muted-foreground">
                        {formatDate(subscription.scheduledAt)}に
                        {planDisplayName(
                          (subscription.scheduledPlanType as PlanType) ?? "free",
                          subscription.scheduledBillingCycle ?? currentCycle,
                        )}
                        に変更予定
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={pending || isStaff}
                        pending={pendingKey === "cancel-reservation"}
                        onClick={handleCancelReservation}
                      >
                        変更をキャンセルする
                      </Button>
                    </div>
                  )}
                  {subscription?.cancelAtPeriodEnd && !subscription.scheduleId && (
                    <div className="mt-3 space-y-2">
                      <p className="text-body-sm text-muted-foreground">
                        {formatDate(subscription.currentPeriodEnd)}に解約予定
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={pending || isStaff}
                        pending={pendingKey === "cancel-reservation"}
                        onClick={handleCancelReservation}
                      >
                        解約をキャンセルする
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={plan.buttonDisabled || pending}
                    pending={pendingKey === `plan-${plan.planType}`}
                    onClick={() => handlePlanButton(plan)}
                    title={plan.disabledReason ?? undefined}
                  >
                    {plan.buttonAction === "checkout"
                      ? `${formatPrice(plan.price)}円/${plan.billingCycle === "yearly" ? "年" : "月"} ${plan.buttonLabel}`
                      : plan.buttonLabel}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {!isStaff && <BankTransferContactNote />}
      </section>

      {/* ===== オプションプラン セクション ===== */}
      <section className="mt-6 rounded-lg border border-border bg-background p-5 pb-8">
        <h2 className="text-heading-sm font-bold">オプションプラン</h2>
        <div className="mt-5 divide-y divide-border">
          {/* プロフィール動画制作プラン（P10: 旧 自己PR動画掲載 + 職場紹介動画掲載を統合。全会員向け） */}
          <div className="py-4 first:pt-0">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">
                {VIDEO_OPTION_UI_NAMES.video}
              </span>
              <span className="text-body-md">100,000円/動画</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              ビジ友のスタッフが現地にお伺いして撮影・編集し、あなたや会社を紹介する動画を制作します。<br />
              ご希望に応じてビジ友のユーザー詳細や発注者詳細のページに掲載することができます。<br />
              ※エリアにより交通費等が発生する場合があります。<br />
              ※プレミアム・ハイエンドプランの方は本プランが含まれていますので、お申し込みは不要です（2本目以降をご希望の場合はお申し込みください）。
            </p>
            <div className="mt-3 flex flex-col items-center gap-2">
              <Button
                variant="default"
                className="w-full max-w-xs rounded-full text-white"
                disabled={pending || isStaff}
                pending={pendingKey === "opt-video"}
                onClick={() => handleVideoOptionButton("video")}
              >
                {hasVideo ? "再度購入する" : "プロフィール動画制作プランを申し込む"}
              </Button>
            </div>
          </div>

          {/* ユーザー撮影動画制作プラン（P7、全会員向け） */}
          <div className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">
                {VIDEO_OPTION_UI_NAMES.video_shooting}
              </span>
              <span className="text-body-md">20,000円/動画</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              ご自身で撮影した動画をビジ友運営が編集して、ご希望に応じてビジ友のユーザー詳細や発注者詳細のページに掲載することができます。<br />
              ※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。
            </p>
            <div className="mt-3 flex flex-col items-center gap-2">
              <Button
                variant="default"
                className="w-full max-w-xs rounded-full text-white"
                disabled={pending || isStaff}
                pending={pendingKey === "opt-video_shooting"}
                onClick={() => handleVideoOptionButton("video_shooting")}
              >
                {hasVideoShooting ? "再度購入する" : "ユーザー撮影動画制作プランを申し込む"}
              </Button>
            </div>
          </div>

          {/* ビジ友公式SNS動画制作プラン（P10、全会員向け） */}
          <div className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">
                {VIDEO_OPTION_UI_NAMES.video_sns}
              </span>
              <span className="text-body-md">120,000円/動画</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              ビジ友のスタッフが現地にお伺いして撮影・編集し、ビジ友の公式SNSで紹介する動画を制作します。<br />
              ※エリアにより交通費等が発生する場合があります。<br />
              ※プレミアム・ハイエンドプランを年払いでご利用の方は本プランが含まれていますので、お申し込みは不要です。
            </p>
            <div className="mt-3 flex flex-col items-center gap-2">
              <Button
                variant="default"
                className="w-full max-w-xs rounded-full text-white"
                disabled={pending || isStaff}
                pending={pendingKey === "opt-video_sns"}
                onClick={() => handleVideoOptionButton("video_sns")}
              >
                {hasVideoSns ? "再度購入する" : "ビジ友公式SNS動画制作プランを申し込む"}
              </Button>
            </div>
          </div>

          {/* 急募 */}
          <div className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">急募</span>
              <span className="text-body-md">20,000円</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              7日間募集が最上位表示され、急募のタグが表示されます。
            </p>
            {urgentEligibleJobs.length === 0 ? (
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
              P8: 販売停止中は加入中の人にだけ行を出す（解約のみ。新規申込ボタンは出さない） */}
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

          {/* 補償 ¥9,800/月（受注者向け 報酬未払い保険）P8: 同上 */}
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
        {!isStaff && <BankTransferContactNote />}
      </section>

      {/* Customer Portal（銀行振込契約には Stripe の支払情報が無いため出さない） */}
      {currentPlan !== "free" && !isStaff && !isBankTransferPlan && (
        <section className="mt-6 flex justify-center">
          <Button
            variant="outline"
            className="w-full max-w-xs rounded-full text-primary border-primary/50"
            disabled={pending}
            pending={pendingKey === "portal"}
            onClick={handleOpenPortal}
          >
            お支払い情報を管理する
          </Button>
        </section>
      )}

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

      {/* ===== Dialogs ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          {dialogType === "upgrade" && dialogTarget && (
            <>
              <DialogHeader>
                <DialogTitle>プラン変更の確認</DialogTitle>
                <DialogDescription>
                  以下の内容に変更します。このあと Stripe の確認画面に移動し、日割りの差額と次回請求額を確認してから確定できます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-body-sm">
                <p>現在のプラン: {planDisplayName(currentPlan, currentCycle)}</p>
                <p>変更後のプラン: {planDisplayName(dialogTarget, dialogTargetCycle)}</p>
                <p className="text-muted-foreground">
                  変更後の料金: ¥{formatPrice(planPriceFor(dialogTarget, dialogTargetCycle))}/
                  {dialogTargetCycle === "yearly" ? "年" : "月"}
                </p>
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full">
                    キャンセルする
                  </Button>
                </DialogClose>
                <Button
                  variant="default"
                  className="rounded-full text-white"
                  disabled={pending}
                  pending={pendingKey === "dialog"}
                  onClick={handleDialogConfirm}
                >
                  プラン変更する
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "downgrade" && dialogTarget && (
            <>
              <DialogHeader>
                <DialogTitle>ダウングレード予約の確認</DialogTitle>
                <DialogDescription>
                  現在の請求期間終了後にプランが変更されます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-body-sm">
                <p>現在のプラン: {planDisplayName(currentPlan, currentCycle)}</p>
                <p>変更後のプラン: {planDisplayName(dialogTarget, dialogTargetCycle)}</p>
                <p className="text-muted-foreground">
                  {formatDate(subscription?.currentPeriodEnd)}まで現在のプランでご利用いただけます
                </p>
                <p className="text-muted-foreground">
                  次回課金日と金額: ¥{formatPrice(planPriceFor(dialogTarget, dialogTargetCycle))}/
                  {dialogTargetCycle === "yearly" ? "年" : "月"}
                </p>
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full">
                    キャンセルする
                  </Button>
                </DialogClose>
                <Button
                  variant="default"
                  className="rounded-full text-white"
                  disabled={pending}
                  pending={pendingKey === "dialog"}
                  onClick={handleDialogConfirm}
                >
                  プラン変更を予約する
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>解約の確認</DialogTitle>
                <DialogDescription>
                  現在の請求期間終了後に無料プランに切り替わります。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-body-sm">
                <p>
                  {formatDate(subscription?.currentPeriodEnd)}まで現在のプランでご利用いただけます
                </p>
                <p className="text-muted-foreground">
                  解約後は発注者機能がご利用いただけなくなります。
                </p>
                {(hasComp5000 || hasComp9800) && (
                  <p className="text-body-xs text-muted-foreground mt-2">
                    ※ 加入中の補償オプションは基本プラン解約後も継続課金されます。補償も停止する場合は、別途オプションプラン欄から解約してください。
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full">
                    キャンセルする
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  disabled={pending}
                  pending={pendingKey === "dialog"}
                  onClick={handleScheduleCancelConfirm}
                >
                  解約する
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "cancel_past_due" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  即時解約
                </DialogTitle>
                <DialogDescription>
                  お支払い遅延中のため、即時解約となります。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-body-sm">
                <p className="text-destructive font-semibold">
                  以下の処理が直ちに実行されます:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>掲載中の案件がすべてクローズされます</li>
                  <li>担当者のログインが停止されます</li>
                </ul>
                {(hasComp5000 || hasComp9800) && (
                  <p className="text-body-xs text-muted-foreground mt-2">
                    ※ 加入中の補償オプションは基本プラン解約後も継続課金されます。補償も停止する場合は、別途オプションプラン欄から解約してください。
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => {
                    setDialogOpen(false);
                    handleOpenPortal();
                  }}
                >
                  お支払い方法を更新する
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  disabled={pending}
                  pending={pendingKey === "dialog"}
                  onClick={handleCancelImmediatelyConfirm}
                >
                  解約する
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "repurchase_video" && (
            <>
              <DialogHeader>
                <DialogTitle>再購入の確認</DialogTitle>
                <DialogDescription>
                  {repurchaseOption ? VIDEO_OPTION_UI_NAMES[repurchaseOption] : ""}
                  は既にご購入済みです。改めて購入しますが、よろしいですか？
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full">
                    キャンセルする
                  </Button>
                </DialogClose>
                <Button
                  variant="default"
                  className="rounded-full text-white"
                  disabled={pending}
                  pending={
                    repurchaseOption !== null &&
                    pendingKey === `opt-${repurchaseOption}`
                  }
                  onClick={handleRepurchaseConfirm}
                >
                  購入する
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "cancel_comp" && (
            <>
              <DialogHeader>
                <DialogTitle>補償オプション解約の確認</DialogTitle>
                <DialogDescription>
                  補償オプションを解約しますか？
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full">
                    キャンセルする
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  disabled={pending}
                  pending={pendingKey === "dialog"}
                  onClick={handleCancelCompensationConfirm}
                >
                  解約する
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Local helper — same as server-side comparePlans but avoids importing server modules

// ---------------------------------------------------------------------------
// 銀行振込（P12）: 案内文（基本プラン欄・オプション欄の末尾へ表示）
// ---------------------------------------------------------------------------

/**
 * 銀行振込はお問い合わせで受け付け、運営が管理画面で有効にする。ここではリンクだけ出す。
 */
function BankTransferContactNote() {
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

