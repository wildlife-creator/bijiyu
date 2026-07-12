"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
}

/** ストレージ URL が PDF かどうか (クエリを除いた末尾拡張子で判定) */
function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".pdf");
}

export function SafeImage({ src, alt, className }: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  // PDF は <img> で表示できないため、アイコン + リンクで表示する
  if (isPdfUrl(src)) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-col items-center justify-center gap-1 bg-muted text-secondary ${className ?? ""}`}
      >
        <FileText className="size-8" />
        <span className="text-body-xs">PDFを開く</span>
      </a>
    );
  }

  if (hasError) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className ?? ""}`}>
        <img
          src="/images/logo-vertical.png"
          alt=""
          className="w-12 h-12 opacity-20"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
