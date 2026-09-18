"use client";

import { Button } from "@/components/ui/button";
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
  planDisplayName,
  planPriceFor,
  type BillingCycle,
  type PaidPlanType,
  type PlanType,
} from "@/lib/constants/plans";
import { VIDEO_OPTION_UI_NAMES, type VideoOptionType } from "@/lib/billing/options";
import { formatDate, formatPrice } from "./billing-parts";

/** 料金プラン画面で開く確認ダイアログの種類。 */
export type BillingDialogType =
  | "upgrade"
  | "downgrade"
  | "cancel"
  | "cancel_past_due"
  | "cancel_comp"
  | "repurchase_video";

interface BillingDialogsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogType: BillingDialogType | null;
  /** プラン変更（upgrade / downgrade）の変更先 */
  targetPlan: PaidPlanType | null;
  targetCycle: BillingCycle;
  /** 再購入する動画プラン */
  repurchaseOption: VideoOptionType | null;
  currentPlan: PlanType;
  currentCycle: BillingCycle;
  /** 現在の契約の期末（ダウングレード・解約の案内に使う） */
  currentPeriodEnd: string | null | undefined;
  /** 補償オプションに加入中（解約時の注意書きを出す） */
  hasCompensation: boolean;
  pending: boolean;
  pendingKey: string | null;
  onConfirmPlanChange: () => void;
  onConfirmScheduleCancel: () => void;
  onConfirmCancelImmediately: () => void;
  onOpenPortal: () => void;
  onConfirmRepurchase: () => void;
  onConfirmCancelCompensation: () => void;
}

/**
 * 料金プラン画面の確認ダイアログ群。開閉と種類は親（BillingClient）が持ち、
 * ここは種類に応じた文言とボタンを描くだけ。
 */
export function BillingDialogs({
  open,
  onOpenChange,
  dialogType,
  targetPlan,
  targetCycle,
  repurchaseOption,
  currentPlan,
  currentCycle,
  currentPeriodEnd,
  hasCompensation,
  pending,
  pendingKey,
  onConfirmPlanChange,
  onConfirmScheduleCancel,
  onConfirmCancelImmediately,
  onOpenPortal,
  onConfirmRepurchase,
  onConfirmCancelCompensation,
}: BillingDialogsProps) {
  const cycleUnit = targetCycle === "yearly" ? "年" : "月";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {dialogType === "upgrade" && targetPlan && (
          <>
            <DialogHeader>
              <DialogTitle>プラン変更の確認</DialogTitle>
              <DialogDescription>
                以下の内容に変更します。このあと Stripe の確認画面に移動し、日割りの差額と次回請求額を確認してから確定できます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-body-sm">
              <p>現在のプラン: {planDisplayName(currentPlan, currentCycle)}</p>
              <p>変更後のプラン: {planDisplayName(targetPlan, targetCycle)}</p>
              <p className="text-muted-foreground">
                変更後の料金: ¥{formatPrice(planPriceFor(targetPlan, targetCycle))}/{cycleUnit}
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
                onClick={onConfirmPlanChange}
              >
                プラン変更する
              </Button>
            </DialogFooter>
          </>
        )}

        {dialogType === "downgrade" && targetPlan && (
          <>
            <DialogHeader>
              <DialogTitle>ダウングレード予約の確認</DialogTitle>
              <DialogDescription>
                現在の請求期間終了後にプランが変更されます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-body-sm">
              <p>現在のプラン: {planDisplayName(currentPlan, currentCycle)}</p>
              <p>変更後のプラン: {planDisplayName(targetPlan, targetCycle)}</p>
              <p className="text-muted-foreground">
                {formatDate(currentPeriodEnd)}まで現在のプランでご利用いただけます
              </p>
              <p className="text-muted-foreground">
                次回課金日と金額: ¥{formatPrice(planPriceFor(targetPlan, targetCycle))}/{cycleUnit}
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
                onClick={onConfirmPlanChange}
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
              <p>{formatDate(currentPeriodEnd)}まで現在のプランでご利用いただけます</p>
              <p className="text-muted-foreground">
                解約後は発注者機能がご利用いただけなくなります。
              </p>
              {hasCompensation && (
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
                onClick={onConfirmScheduleCancel}
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
              {hasCompensation && (
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
                  onOpenChange(false);
                  onOpenPortal();
                }}
              >
                お支払い方法を更新する
              </Button>
              <Button
                variant="destructive"
                className="rounded-full"
                disabled={pending}
                pending={pendingKey === "dialog"}
                onClick={onConfirmCancelImmediately}
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
                onClick={onConfirmRepurchase}
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
              <DialogDescription>補償オプションを解約しますか？</DialogDescription>
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
                onClick={onConfirmCancelCompensation}
              >
                解約する
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
