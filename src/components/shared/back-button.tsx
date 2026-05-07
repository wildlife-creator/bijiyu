"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  className?: string;
  /**
   * 明示的な遷移先。指定された場合は router.push() を使う。
   * 未指定の場合は router.back()（ブラウザ履歴ベース）。
   *
   * ## いつ href を指定すべきか
   *
   * CLAUDE.md の原則は「router.back() + 履歴ベース」だが、以下の場面では
   * href 指定が必要:
   *
   * - Save Server Action の redirect で `window.location.href` / `router.push`
   *   によって**現在画面の親画面に戻る**フローがあり、結果として
   *   履歴に余計な edit 画面エントリが残る場面
   * - 例: CLI-020 は親=/mypage。ところが CLI-021 で保存すると redirect で
   *   /mypage/client-profile に入る → 履歴に /edit が残ったまま。
   *   その状態で router.back() すると /edit に戻ってしまう（ループ）
   *
   * ツリー構造（画面階層）で上位が固定している画面では、明示的に親を
   * 指定して保存後ループを防ぐ。
   */
  href?: string;
  size?: "default" | "lg";
}

export function BackButton({ className, href, size }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button
      variant="outline"
      size={size}
      className={cn("w-full rounded-pill text-body-md", className)}
      onClick={handleClick}
    >
      もどる
    </Button>
  );
}
