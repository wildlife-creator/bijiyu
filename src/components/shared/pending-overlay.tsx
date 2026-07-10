"use client";

import { Loader2 } from "lucide-react";

interface PendingOverlayProps {
  /** useTransition の isPending 等、遷移中フラグ */
  active: boolean;
}

/**
 * フィルタ・ソート・ページ送りの router.push 中に画面全体を薄く覆い、
 * スピナーで「読み込み中」を伝えるオーバーレイ。
 *
 * NavigationDim（54c54ed）は `<a>` クリックのみ検知するため、プログラム遷移
 * （router.push）では反応しない。その穴を埋める router.push 版で、見た目は
 * NavigationDim と揃える（bg-white/50 の半透明フェード）。呼び出し側で
 * useTransition の isPending を active に渡す。
 */
export function PendingOverlay({ active }: PendingOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-white/50 transition-opacity duration-150 ${
        active
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      {active && <Loader2 className="size-8 animate-spin text-primary" />}
    </div>
  );
}
