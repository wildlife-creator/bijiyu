"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeJobAction } from "@/app/(authenticated)/jobs/actions";

interface CloseJobButtonProps {
  jobId: string;
  // 発注確定済み（稼働予定/稼働中）の受注者数。1 名以上いる場合は
  // 「案件自体がなくなっても受注者には通知されない」旨の注意喚起を出す
  acceptedCount?: number;
}

export function CloseJobButton({ jobId, acceptedCount = 0 }: CloseJobButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleClose() {
    const message =
      acceptedCount > 0
        ? "掲載を終了しても、発注済みの受注者には自動で通知されません。案件自体が中止になった場合は、必ずメッセージ等でご連絡ください。"
        : "掲載を終了してもよろしいですか？";
    if (!confirm(message)) return;

    setIsLoading(true);
    const result = await closeJobAction(jobId);
    setIsLoading(false);

    if (result.success) {
      router.refresh();
    } else {
      alert(result.error ?? "掲載終了に失敗しました");
    }
  }

  return (
    <button
      onClick={handleClose}
      disabled={isLoading}
      className="text-body-md text-destructive hover:underline disabled:opacity-50"
    >
      {isLoading ? "処理中..." : "掲載を終了する"}
    </button>
  );
}
