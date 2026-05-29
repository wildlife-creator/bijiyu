"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// CON-006(/clients/[id]) で ?inquiry=success を検出して送信完了トーストを表示し、
// クエリパラメータを除去する（リロード時の二重表示防止）。
export function InquirySuccessToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inquiry = searchParams.get("inquiry");

  useEffect(() => {
    if (inquiry === "success") {
      toast.success("問い合わせを送信しました");
      router.replace(pathname);
    }
  }, [inquiry, pathname, router]);

  return null;
}
