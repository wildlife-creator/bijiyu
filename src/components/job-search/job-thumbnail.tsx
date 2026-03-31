"use client";

import { useState } from "react";

interface JobThumbnailProps {
  src: string | null;
  alt: string;
}

export function JobThumbnail({ src, alt }: JobThumbnailProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-muted">
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
      className="w-full h-full object-cover"
      onError={() => setHasError(true)}
    />
  );
}
