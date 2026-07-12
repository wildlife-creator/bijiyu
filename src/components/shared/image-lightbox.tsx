"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ImageLightboxProps {
  /** 拡大表示する画像の URL */
  src: string;
  alt?: string;
  /** トリガー（サムネ）ボタンに付与するクラス */
  className?: string;
  /** クリック対象のサムネ（既存の <img> 等をそのまま渡す） */
  children: ReactNode;
}

/**
 * 画像添付のクリックズーム共通部品。
 * children にサムネ（既存の <img> 等）を渡すと、クリックで全画面 Dialog に
 * object-contain で全体表示する（Esc / 外側タップ / × で閉じる。スマホはピンチズーム可）。
 *
 * PDF はズーム対象外。呼び出し側で PDF はリンク表示にし、画像のみ本コンポーネントで
 * ラップすること。
 */
export function ImageLightbox({
  src,
  alt = "",
  className,
  children,
}: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="画像を拡大表示"
        className={cn("block max-w-full cursor-zoom-in", className)}
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[95vw] border-0 bg-transparent p-0 ring-0 sm:max-w-4xl">
          <DialogTitle className="sr-only">画像プレビュー</DialogTitle>
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[85vh] w-auto rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
