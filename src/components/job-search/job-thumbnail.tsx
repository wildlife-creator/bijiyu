"use client";

import { useState } from "react";

interface JobThumbnailProps {
  src: string | null;
  alt: string;
}

// 親（案件カードの 16:9 の枠。relative）いっぱいに重ねて表示する。
// 通常の流れに置くと、縦長・正方形の画像の高さで枠が押し広げられ、
// 画像の有無でカードの画像の大きさがそろわなかった（2026-10-01 修正）
export function JobThumbnail({ src, alt }: JobThumbnailProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <img
          src="/images/logo-vertical.png"
          alt=""
          className="w-16 h-16 opacity-20"
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setHasError(true)}
    />
  );
}
