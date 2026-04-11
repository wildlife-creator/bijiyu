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
  showScoutActions: boolean;
  scoutStatus: string | null;
  messageId: string;
  jobId: string | null;
}

export function ScoutActionButtons({
  showScoutActions,
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

  // Pending: only contractor can act
  if (!showScoutActions || localStatus !== "pending") return null;

  function handleAccept() {
    startTransition(async () => {
      const result = await respondToScoutAction(messageId, "accepted");
      if (result.success) {
        setLocalStatus("accepted");
        const targetJobId = result.data?.jobId || jobId;
        if (targetJobId) {
          router.push(
            `/jobs/${targetJobId}/apply?scout_message_id=${messageId}`,
          );
        }
      } else {
        toast.error(result.error);
      }
    });
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
          variant="outline"
          className="flex-1 rounded-full border-primary text-primary hover:bg-primary/5 md:flex-none"
          onClick={() => setShowRejectDialog(true)}
          disabled={isPending}
        >
          スカウトを断る
        </Button>
        <Button
          className="flex-1 rounded-full bg-primary text-white hover:bg-primary/90 md:flex-none"
          onClick={handleAccept}
          disabled={isPending}
        >
          スカウトを受ける
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
