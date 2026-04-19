"use client";

import { useEffect, useState, useTransition } from "react";
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
  PLAN_LABELS,
  PLAN_LIMITS,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
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
  label: string;
  price: number;
  isCurrent: boolean;
  isPastDue: boolean;
  buttonLabel: string;
  buttonDisabled: boolean;
  buttonAction: "checkout" | "change" | "none";
  disabledReason: string | null;
}

interface SubscriptionInfo {
  scheduleId: string | null;
  scheduledPlanType: string | null;
  scheduledAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
}

interface ActiveOption {
  id: string;
  optionType: string;
  jobId: string | null;
  stripeSubscriptionId: string | null;
  endDate: string | null;
}

interface ClientProfile {
  isUrgentOption: boolean;
  isCompensation5000: boolean;
  isCompensation9800: boolean;
}

interface BillingClientProps {
  userId: string;
  isStaff: boolean;
  isPastDue: boolean;
  hasReservation: boolean;
  currentPlan: PlanType;
  isFirstPurchase: boolean;
  subscription: SubscriptionInfo | null;
  planStates: PlanState[];
  showInitialFee: boolean;
  activeOptions: ActiveOption[];
  clientProfile: ClientProfile;
  urgentEligibleJobs: Array<{ id: string; title: string }>;
  checkoutSuccess?: string;
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
  userId,
  isStaff,
  isPastDue,
  hasReservation,
  currentPlan,
  isFirstPurchase,
  subscription,
  planStates,
  showInitialFee,
  activeOptions,
  clientProfile,
  urgentEligibleJobs,
  checkoutSuccess,
}: BillingClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<
    "upgrade" | "downgrade" | "cancel" | "cancel_past_due" | "cancel_comp" | null
  >(null);
  const [dialogTarget, setDialogTarget] = useState<PaidPlanType | null>(null);
  const [cancelCompId, setCancelCompId] = useState<string | null>(null);

  // Urgent option state
  const [selectedJobId, setSelectedJobId] = useState<string>("");

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
      toast.success("動画掲載オプションのお申し込みが完了しました");
      router.replace("/billing");
    }
  }, [checkoutSuccess, router]);

  // --- Action handlers ---

  function handlePlanButton(plan: PlanState) {
    if (plan.buttonAction === "checkout") {
      startTransition(async () => {
        const result = await startCheckoutAction({
          type: "plan",
          planType: plan.planType,
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
      const comparison = comparePlansLocal(currentPlan, plan.planType);
      if (comparison === "upgrade") {
        setDialogType("upgrade");
      } else {
        setDialogType("downgrade");
      }
      setDialogTarget(plan.planType);
      setDialogOpen(true);
    }
  }

  function handleDialogConfirm() {
    if (!dialogTarget) return;
    setDialogOpen(false);
    startTransition(async () => {
      const result = await changePlanAction({ targetPlan: dialogTarget });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.performedType === "upgrade") {
        toast.success(`${result.data.newPlanName}にアップグレードしました`);
        // 全プラン共通で CLI-021（発注者情報編集）の setup モードに遷移。
        // Next.js の Router Cache によるリダイレクト結果キャッシュ回避のため
        // window.location.href でハードナビゲーションする。
        window.location.href = "/mypage/client-profile/edit?setup=true";
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    optionType: "compensation_5000" | "compensation_9800" | "urgent" | "video",
    jobId?: string,
  ) {
    startTransition(async () => {
      const input =
        optionType === "urgent" && jobId
          ? { type: "option" as const, optionType, jobId }
          : optionType === "compensation_5000" || optionType === "compensation_9800"
            ? { type: "option" as const, optionType }
            : { type: "option" as const, optionType: optionType as "video" };
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

  function handleCancelCompensation(optId: string) {
    setCancelCompId(optId);
    setDialogType("cancel_comp");
    setDialogOpen(true);
  }

  function handleCancelCompensationConfirm() {
    if (!cancelCompId) return;
    setDialogOpen(false);
    startTransition(async () => {
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
    <div className="min-h-screen bg-muted">
      <div className="mx-auto max-w-lg px-4 py-6">
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
        {showInitialFee ? (
          <p className="mt-2 text-body-sm text-muted-foreground">
            ※基本プランの有料プランへ初めて申し込みをした場合、初回事務手数料として20,000円が必要となります。
          </p>
        ) : !isFirstPurchase ? (
          <p className="mt-2 text-body-sm text-muted-foreground">
            ※この画面から基本プランに申し込んだ場合は、初回事務手数料の20,000円は不要となります。
          </p>
        ) : null}

        <div className="mt-4 divide-y divide-border">
          {planStates.map((plan) => (
            <div key={plan.planType} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-body-md font-bold">{plan.label}</span>
                <span className="text-body-md">
                  {formatPrice(plan.price)}円/月
                </span>
              </div>

              {plan.isCurrent ? (
                <div className="mt-2">
                  <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                    ご利用中
                  </Badge>
                  {plan.isPastDue && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      お支払い確認中
                    </Badge>
                  )}
                  {/* 解約ボタン（現在のプラン枠内） */}
                  {!isStaff && (
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
                        {PLAN_LABELS[(subscription.scheduledPlanType as PlanType) ?? "free"]}
                        に変更予定
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={pending}
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
                        disabled={pending}
                        onClick={handleCancelReservation}
                      >
                        解約をキャンセルする
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={plan.buttonDisabled || pending}
                    onClick={() => handlePlanButton(plan)}
                    title={plan.disabledReason ?? undefined}
                  >
                    {plan.buttonAction === "checkout"
                      ? `${formatPrice(plan.price)}円/月 申し込む`
                      : plan.buttonLabel}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

      </section>

      {/* ===== オプションプラン セクション ===== */}
      <section className="mt-6 rounded-lg border border-border bg-background p-5 pb-8">
        <h2 className="text-heading-sm font-bold">オプションプラン</h2>
        <div className="mt-5 divide-y divide-border">
          {/* 動画掲載 */}
          <div className="py-4 first:pt-0">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">動画掲載</span>
              <span className="text-body-md">100,000円/動画</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              ユーザー情報画面へのPR動画掲載や<br />
              ビジ友TikTok紹介ページへの動画掲載を承ります。
            </p>
            <div className="mt-3 flex justify-center">
              <Button
                variant="default"
                className="w-full max-w-xs rounded-full text-white"
                disabled={pending || isStaff}
                onClick={() => handleOptionCheckout("video")}
              >
                動画掲載を申し込む
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
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
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
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="default"
                    className="w-full max-w-xs rounded-full text-white"
                    disabled={!selectedJobId || pending || isStaff}
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

          {/* 補償 ¥5,000/月 */}
          <div className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">補償</span>
              <span className="text-body-md">5,000円/月</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              月5,000円で、有事の際最大200万円の補償があります。
            </p>
            {clientProfile.isCompensation5000 && (
              <div className="mt-2">
                <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                  ご利用中
                </Badge>
              </div>
            )}
            <div className="mt-3 flex justify-center">
              {clientProfile.isCompensation5000 ? (
                <Button
                  variant="outline"
                  className="w-full max-w-xs rounded-full text-destructive border-destructive/50"
                  disabled={pending}
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
                <Button
                  variant="default"
                  className="w-full max-w-xs rounded-full text-white"
                  disabled={
                    clientProfile.isCompensation9800 ||
                    pending ||
                    isStaff ||
                    currentPlan === "free"
                  }
                  onClick={() => handleOptionCheckout("compensation_5000")}
                >
                  補償（5,000円）を申し込む
                </Button>
              )}
            </div>
          </div>

          {/* 補償 ¥9,800/月 */}
          <div className="py-4 last:pb-0">
            <div className="flex items-center justify-between">
              <span className="text-body-md font-bold">補償</span>
              <span className="text-body-md">9,800円/月</span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              月9,800円で、有事の際最大500万円の補償があります。
            </p>
            {clientProfile.isCompensation9800 && (
              <div className="mt-2">
                <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-xs text-emerald-700">
                  ご利用中
                </Badge>
              </div>
            )}
            <div className="mt-3 flex justify-center">
              {clientProfile.isCompensation9800 ? (
                <Button
                  variant="outline"
                  className="w-full max-w-xs rounded-full text-destructive border-destructive/50"
                  disabled={pending}
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
                <Button
                  variant="default"
                  className="w-full max-w-xs rounded-full text-white"
                  disabled={
                    clientProfile.isCompensation5000 ||
                    pending ||
                    isStaff ||
                    currentPlan === "free"
                  }
                  onClick={() => handleOptionCheckout("compensation_9800")}
                >
                  補償（9,800円）を申し込む
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Customer Portal */}
      {currentPlan !== "free" && !isStaff && (
        <section className="mt-6 flex justify-center">
          <Button
            variant="outline"
            className="w-full max-w-xs rounded-full text-primary border-primary/50"
            disabled={pending}
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
      </div>

      {/* ===== Dialogs ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          {dialogType === "upgrade" && dialogTarget && (
            <>
              <DialogHeader>
                <DialogTitle>プラン変更の確認</DialogTitle>
                <DialogDescription>
                  以下のプランにアップグレードします。日割り差額が即時課金されます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-body-sm">
                <p>現在のプラン: {PLAN_LABELS[currentPlan]}</p>
                <p>変更後のプラン: {PLAN_LABELS[dialogTarget]}</p>
                <p className="text-muted-foreground">
                  次回課金額: ¥{formatPrice(PLAN_LIMITS[dialogTarget].monthlyPriceTaxIncluded)}/月
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
                <p>現在のプラン: {PLAN_LABELS[currentPlan]}</p>
                <p>変更後のプラン: {PLAN_LABELS[dialogTarget]}</p>
                <p className="text-muted-foreground">
                  {formatDate(subscription?.currentPeriodEnd)}まで現在のプランでご利用いただけます
                </p>
                <p className="text-muted-foreground">
                  次回課金日と金額: ¥{formatPrice(PLAN_LIMITS[dialogTarget].monthlyPriceTaxIncluded)}/月
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
                  <li>加入中の補償オプションも解約されます</li>
                </ul>
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
                  onClick={handleCancelImmediatelyConfirm}
                >
                  解約する
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
                  onClick={handleCancelCompensationConfirm}
                >
                  解約する
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Local helper — same as server-side comparePlans but avoids importing server modules
function comparePlansLocal(a: PlanType, b: PlanType): "upgrade" | "downgrade" | "same" {
  const ranks: Record<PlanType, number> = {
    free: 0,
    individual: 1,
    small: 2,
    corporate: 3,
    corporate_premium: 4,
  };
  if (ranks[b] > ranks[a]) return "upgrade";
  if (ranks[b] < ranks[a]) return "downgrade";
  return "same";
}
