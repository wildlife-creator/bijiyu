"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface ZoomableImageProps {
  src: string;
  alt: string;
  /** 枠のスタイル (aspect / rounded / 背景 / w-full 等)。PDF・エラー時も同じ枠を使う */
  frameClassName?: string;
  /** 枠内の画像の object-fit。ヒーロー = contain、サムネ = cover */
  fit?: "cover" | "contain";
}

/** ストレージ URL が PDF かどうか (クエリを除いた末尾拡張子で判定) */
function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".pdf");
}

/**
 * 案件画像の表示部品。
 * - PDF: アイコン + 「PDFを開く」リンク (ズーム対象外)
 * - 画像: クリックで全画面 Dialog に object-contain で全体表示 (Esc / 外側タップで閉じる)
 * - 読み込みエラー: ロゴのプレースホルダ
 */
export function ZoomableImage({
  src,
  alt,
  frameClassName,
  fit = "cover",
}: ZoomableImageProps) {
  const [hasError, setHasError] = useState(false);
  const [open, setOpen] = useState(false);

  // PDF は <img> で表示できないため、アイコン + リンクで表示する (ズーム不可)
  if (isPdfUrl(src)) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-col items-center justify-center gap-1 bg-muted text-secondary ${frameClassName ?? ""}`}
      >
        <FileText className="size-8" />
        <span className="text-body-xs">PDFを開く</span>
      </a>
    );
  }

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-muted ${frameClassName ?? ""}`}
      >
        <img
          src="/images/logo-vertical.png"
          alt=""
          className="h-12 w-12 opacity-20"
        />
      </div>
    );
  }

  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="画像を拡大表示"
        className={`block cursor-zoom-in overflow-hidden ${frameClassName ?? ""}`}
      >
        <img
          src={src}
          alt={alt}
          className={`h-full w-full ${fitClass}`}
          onError={() => setHasError(true)}
        />
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
