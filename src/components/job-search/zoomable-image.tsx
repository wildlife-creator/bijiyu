"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { isPdfUrl } from "@/lib/utils/is-pdf-url";

interface ZoomableImageProps {
  src: string;
  alt: string;
  /** 枠のスタイル (aspect / rounded / 背景 / w-full 等)。PDF・エラー時も同じ枠を使う */
  frameClassName?: string;
  /** 枠内の画像の object-fit。ヒーロー = contain、サムネ = cover */
  fit?: "cover" | "contain";
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
    <ImageLightbox
      src={src}
      alt={alt}
      className={cn("overflow-hidden", frameClassName)}
    >
      <img
        src={src}
        alt={alt}
        className={`h-full w-full ${fitClass}`}
        onError={() => setHasError(true)}
      />
    </ImageLightbox>
  );
}
