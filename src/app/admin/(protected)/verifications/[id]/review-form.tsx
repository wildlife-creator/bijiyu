"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveVerificationAction,
  rejectVerificationAction,
} from "./actions";

interface ReviewFormProps {
  verificationId: string;
  /**
   * セクションの基本活性条件。
   * 本人確認＝常に true ／ CCUS＝users.identity_verified が true の場合のみ。
   * （承認はこの条件のみ・否認はこの条件＋否認理由入力時に活性化）
   */
  enabled: boolean;
}

/**
 * ADM-012: 否認理由入力＋否認/承認ボタン（審査対象セクション用）。
 */
export function ReviewForm({ verificationId, enabled }: ReviewFormProps) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const canApprove = enabled && !isPending;
  const canReject = enabled && reason.trim().length > 0 && !isPending;

  function handleApprove() {
    startTransition(async () => {
      const result = await approveVerificationAction(verificationId);
      // 成功時は Server Action 内で redirect されるためここには戻らない
      if (result && !result.success) {
        toast.error(result.error);
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("rejectionReason", reason);
      const result = await rejectVerificationAction(verificationId, fd);
      if (result && !result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label
          htmlFor={`rejection-reason-${verificationId}`}
          className="text-body-sm font-bold text-foreground"
        >
          否認理由
        </label>
        <Textarea
          id={`rejection-reason-${verificationId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="テキスト"
          maxLength={1000}
          disabled={!enabled}
          className="mt-1 min-h-24 bg-background"
        />
      </div>

      <div className="flex justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!canReject}
          onClick={handleReject}
          className="w-36 rounded-full"
        >
          否認
        </Button>
        <Button
          type="button"
          disabled={!canApprove}
          onClick={handleApprove}
          className="w-36 rounded-full bg-primary text-white hover:bg-primary/90"
        >
          {isPending ? "処理中..." : "承認"}
        </Button>
      </div>
    </div>
  );
}
