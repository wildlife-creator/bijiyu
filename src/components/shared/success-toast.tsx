"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

interface SuccessToastProps {
  /** 監視する URL クエリ名（例: "success" / "inquiry"） */
  param: string;
  /** クエリの値 → トーストの文言 */
  messages: Record<string, string>;
}

/**
 * Server Action の redirect で付いたクエリ（例: `?success=report`）を検出して
 * 完了トーストを 1 回だけ出し、クエリを URL から外す（リロード時の二重表示防止）。
 * 他のクエリは残す。
 */
export function SuccessToast({ param, messages }: SuccessToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(param);
  const message = value ? messages[value] : undefined;

  useEffect(() => {
    if (!message) return;
    toast.success(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(param);
    const remaining = params.toString();
    router.replace(`${pathname}${remaining ? `?${remaining}` : ""}`);
  }, [message, param, pathname, router, searchParams]);

  return null;
}
