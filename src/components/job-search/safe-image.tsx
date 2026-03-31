"use client";

import { useState } from "react";

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function SafeImage({ src, alt, className }: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

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
