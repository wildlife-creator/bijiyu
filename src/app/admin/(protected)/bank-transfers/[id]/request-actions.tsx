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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BankTransferRequestStatus } from "@/lib/billing/bank-transfer";

import {
  activateBankTransferAction,
  cancelBankTransferRequestAction,
  markBankTransferInvoicedAction,
} from "../actions";

interface BankTransferRequestActionsProps {
  requestId: string;
  status: BankTransferRequestStatus;
  targetLabel: string;
  /** 利用開始日の既定値（YYYY-MM-DD、JST）。Stripe 契約中なら期間終了日の翌日 */
  suggestedStartDate: string;
}

/**
 * ADM-026 の操作パネル（申込受付 / 請求書送付済 のときのみ表示）。
 * - 請求書を送付済みにする（確認ダイアログ）
 * - 入金を確認して有効化する（利用開始日を入力）
 * - 申込を取り消す（理由メモ）
 * 成功時は router.refresh() で Server Component を再描画する。
 */
export function BankTransferRequestActions({
  requestId,
  status,
  targetLabel,
  suggestedStartDate,
}: BankTransferRequestActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const [activateOpen, setActivateOpen] = useState(false);
  const [startDate, setStartDate] = useState(suggestedStartDate);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMemo, setCancelMemo] = useState("");

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

  function handleMarkInvoiced() {
    run("invoiced", async () => {
      const result = await markBankTransferInvoicedAction(requestId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("請求書送付済みにしました");
      router.refresh();
    });
  }

  function handleActivate() {
    run("activate", async () => {
      const fd = new FormData();
      fd.set("startDate", startDate);
      const result = await activateBankTransferAction(requestId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setActivateOpen(false);
      toast.success(
        result.data?.periodEnd
          ? `有効化しました（有効期限 ${result.data.periodEnd}）`
          : "有効化しました",
      );
      router.refresh();
    });
  }

  function handleCancel() {
    run("cancel", async () => {
      const fd = new FormData();
      fd.set("memo", cancelMemo);
      const result = await cancelBankTransferRequestAction(requestId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCancelOpen(false);
      toast.success("申込を取り消しました");
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-[8px] border border-border/20 bg-background p-4">
      {status === "requested" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full max-w-xs rounded-full"
              disabled={isPending}
              pending={pendingKey === "invoiced"}
            >
              請求書を送付済みにする
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>請求書を送付済みにしますか？</AlertDialogTitle>
              <AlertDialogDescription>
                申込者に請求書を送付したら押してください。状態が「請求書送付済」になります（メールは送信されません）。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={handleMarkInvoiced} disabled={isPending}>
                送付済みにする
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Button
        type="button"
        className="w-full max-w-xs rounded-full bg-primary text-white hover:bg-primary/90"
        disabled={isPending}
        pending={pendingKey === "activate"}
        onClick={() => setActivateOpen(true)}
      >
        入金を確認して有効化する
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full max-w-xs rounded-full text-destructive border-destructive/50"
        disabled={isPending}
        pending={pendingKey === "cancel"}
        onClick={() => setCancelOpen(true)}
      >
        申込を取り消す
      </Button>

      {/* 有効化ダイアログ */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>入金を確認して有効化する</DialogTitle>
            <DialogDescription>
              {targetLabel} を有効化します。利用開始日を確認してください（有効期限は開始日から 1 か月／年払いは 1 年です。期限が来ても自動では停止しません）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bank-transfer-start-date">利用開始日</Label>
            <Input
              id="bank-transfer-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-background"
            />
            <p className="text-body-xs text-muted-foreground">
              既定は本日です。クレジットカード契約からの切替は、その期間終了日の翌日を指定してください。
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setActivateOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              className="rounded-full bg-primary text-white hover:bg-primary/90"
              onClick={handleActivate}
              disabled={isPending || !startDate}
              pending={pendingKey === "activate"}
            >
              有効化する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 取消ダイアログ */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申込を取り消しますか？</DialogTitle>
            <DialogDescription>
              取り消すと申込者は同じ内容を再度申し込めるようになります。申込者へのメールは送信されません（必要なら別途ご連絡ください）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bank-transfer-cancel-memo">取消理由（運営メモに残ります・任意）</Label>
            <Textarea
              id="bank-transfer-cancel-memo"
              value={cancelMemo}
              onChange={(e) => setCancelMemo(e.target.value)}
              className="bg-background"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setCancelOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full"
              onClick={handleCancel}
              disabled={isPending}
              pending={pendingKey === "cancel"}
            >
              取り消す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
