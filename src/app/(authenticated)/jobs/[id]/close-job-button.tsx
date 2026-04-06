"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeJobAction } from "@/app/(authenticated)/jobs/actions";

interface CloseJobButtonProps {
  jobId: string;
}

export function CloseJobButton({ jobId }: CloseJobButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleClose() {
    if (!confirm("掲載を終了してもよろしいですか？")) return;

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
