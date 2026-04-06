"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  report: "作業報告・評価を登録しました",
};

export function SuccessToast() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  useEffect(() => {
    if (success && MESSAGES[success]) {
      toast.success(MESSAGES[success]);
      // Remove success param from URL without triggering navigation
      const params = new URLSearchParams(searchParams.toString());
      params.delete("success");
      const remaining = params.toString();
      router.replace(
        `/applications/history${remaining ? `?${remaining}` : ""}`,
      );
    }
  }, [success, searchParams, router]);

  return null;
}
