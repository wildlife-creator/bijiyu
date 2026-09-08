"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { respondToScoutAction } from "@/app/(authenticated)/messages/[threadId]/actions";
import { toast } from "sonner";

interface ScoutActionButtonsProps {
  /** viewer がこのスカウトに応答できる（受信側 かつ staff ではない） */
  showScoutActions: boolean;
  /** このスカウトが自分側（送信側）のものか（ステージング指摘 1b: 返答待ちの表示） */
  isMine?: boolean;
  /** viewer が担当者（staff）か（ステージング指摘 1c: 返答は管理責任者のみの案内） */
  viewerIsStaff?: boolean;
  scoutStatus: string | null;
  messageId: string;
  jobId: string | null;
}

/** 送信側に見せる文言（ボタンが無いのを不具合と誤認されないため） */
export const SCOUT_WAITING_MESSAGE = "相手の返答を待っています";
/** 受信側の担当者（staff）に見せる文言（受注者アクションは管理責任者のみ） */
export const SCOUT_STAFF_NOTICE = "スカウトへの返答は管理責任者のみ行えます";

export function ScoutActionButtons({
  showScoutActions,
  isMine = false,
  viewerIsStaff = false,
  scoutStatus,
  messageId,
  jobId,
}: ScoutActionButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [localStatus, setLocalStatus] = useState(scoutStatus);

  // Responded state: show status text (visible to both contractor and client)
  if (localStatus === "accepted") {
    return (
      <p className="py-2 text-center text-sm font-medium text-primary">
        スカウトを受けました
      </p>
    );
  }
  if (localStatus === "rejected") {
    return (
      <p className="py-2 text-center text-sm font-medium text-muted-foreground">
        スカウトを断りました
      </p>
    );
  }

  if (localStatus !== "pending") return null;

  // 送信側: ボタンは出さず「返答待ち」を明示する（1b）
  if (isMine) {
    return (
      <p className="py-2 text-center text-sm text-muted-foreground">
        {SCOUT_WAITING_MESSAGE}
      </p>
    );
  }

  // 受信側の担当者（staff）: 受注者アクション不可。管理責任者（Owner）が応答する（1c）
  if (viewerIsStaff) {
    return (
      <p className="py-2 text-center text-sm text-muted-foreground">
        {SCOUT_STAFF_NOTICE}
      </p>
    );
  }

  // Pending: 受信側（送信者の反対側）だけが応答できる
  if (!showScoutActions) return null;

  function handleAccept() {
    if (!jobId) {
      toast.error("案件が見つかりません");
      return;
    }
    // 修正2: 受諾フラグはここでは立てず、応募入力画面へ遷移するのみ。
    // scout_status は応募送信が成功した時点 (applyJobAction) で accepted へ更新する。
    // 途中で離脱してもスカウトは pending のまま残り、再度「受ける」から入り直せる。
    router.push(`/jobs/${jobId}/apply?scout_message_id=${messageId}`);
  }

  function handleRejectConfirm() {
    setShowRejectDialog(false);
    startTransition(async () => {
      const result = await respondToScoutAction(messageId, "rejected");
      if (result.success) {
        setLocalStatus("rejected");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex flex-row gap-2 md:flex-col">
        <Button
          className="flex-1 rounded-full bg-primary text-white hover:bg-primary/90 md:flex-none"
          onClick={handleAccept}
          disabled={isPending}
        >
          スカウトを受ける
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-full border-primary text-primary hover:bg-primary/5 md:flex-none"
          onClick={() => setShowRejectDialog(true)}
          disabled={isPending}
        >
          スカウトを断る
        </Button>
      </div>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>スカウトを断りますか？</AlertDialogTitle>
            <AlertDialogDescription>
              スカウトを断った後もメッセージのやり取りは引き続き可能です。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectConfirm}>
              断る
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
