import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** 空状態のメッセージ（例: 「マイリストに登録されたものはありません。」） */
  children: ReactNode;
  /** 追加クラス（上下マージン調整など） */
  className?: string;
}

/**
 * 一覧系画面の空状態を白カード内に収める共通コンポーネント。
 *
 * 従来は「◯◯がありません」というテキストが背景にそのまま浮いて表示され、
 * 「読み込み中なのか空なのか」が分かりにくかった。グレー枠の白カードで
 * 囲むことで、空であることが明確なブロックとして見えるようにする。
 *
 * 枠線は EmptyState の目的（背景に浮かせない）上あえて視認できる
 * `border-border`（グレー）を使う。詳細画面のカード枠（薄い border/10）
 * とは意図が異なる。
 */
export function EmptyState({ children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[8px] border border-border bg-background px-6 py-16 text-center",
        className,
      )}
    >
      <p className="text-body-md text-muted-foreground">{children}</p>
    </div>
  );
}
