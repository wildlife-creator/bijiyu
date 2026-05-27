"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackChevronProps {
  className?: string;
}

/**
 * ログイン前の入口フォーム（ログイン / 会員登録メール入力 / パスワード再設定依頼）
 * 専用の左上「＜」戻るボタン。
 *
 * 戻る導線の方針:
 * - ログイン後アプリ + (support) 全ページ … 下部の横長「もどる」（{@link BackButton}）
 * - ログイン前の入口フォーム3画面のみ … この左上「＜」
 * - フロー途中・完了・メールリンク先（verify / complete / profile /
 *   reset-password/confirm / accept-invite/confirm）… 戻る無し
 *
 * 以前は (auth) / (support) の layout に一括で付与していたが、フロー途中の
 * 画面にも出てしまうため layout から撤去し、必要なページに個別配置する形に変更した。
 */
export function BackChevron({ className }: BackChevronProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => router.back()}
      aria-label="戻る"
      className={cn("mb-4", className)}
    >
      <ChevronLeft className="size-6" />
    </Button>
  );
}
