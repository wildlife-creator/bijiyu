"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarRatingInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
  size?: "sm" | "md" | "lg";
}

// 星アイコンの見た目サイズ（タップ領域は最低 44px を別途確保）
const STAR_PX: Record<NonNullable<StarRatingInputProps["size"]>, number> = {
  sm: 36,
  md: 40,
  lg: 48,
};

/**
 * ★×5 入力。クリックで 1〜5 を選択、同じ星の再クリックで未評価(null)に戻す。
 * モバイル誤タップ防止のためタップ領域は最低 44px×44px・星間 4px 以上。
 */
export function StarRatingInput({
  value,
  onChange,
  ariaLabel,
  size = "md",
}: StarRatingInputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const starPx = STAR_PX[size];
  const tapPx = Math.max(starPx, size === "lg" ? 48 : 44);
  const active = hover ?? value ?? 0;

  function handleClick(star: number) {
    // 同じ星を再クリック → 未評価に戻す
    onChange(value === star ? null : star);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, (value ?? 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (value ?? 0) - 1;
      onChange(next < 1 ? null : next);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="flex items-center gap-1"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= active;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star}`}
              onClick={() => handleClick(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(null)}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{ minWidth: tapPx, minHeight: tapPx }}
            >
              <Star
                style={{ width: starPx * 0.6, height: starPx * 0.6 }}
                className={cn(
                  filled ? "fill-secondary text-secondary" : "fill-none text-gray-300",
                )}
              />
            </button>
          );
        })}
      </div>
      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-body-sm text-muted-foreground underline underline-offset-2"
        >
          未評価に戻す
        </button>
      )}
    </div>
  );
}
