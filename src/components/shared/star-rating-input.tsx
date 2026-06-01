"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarRatingInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
  size?: "sm" | "md" | "lg";
  /** 「該当なし」トグルを表示するか（道具項目など、評価不能を明示できる項目） */
  allowNotApplicable?: boolean;
  /** 「該当なし」が選択中か（保存上は未評価と同じ NULL。集計から除外される） */
  notApplicable?: boolean;
  /** 「該当なし」トグルの切替ハンドラ */
  onNotApplicableChange?: (notApplicable: boolean) => void;
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
  allowNotApplicable = false,
  notApplicable = false,
  onNotApplicableChange,
}: StarRatingInputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const starPx = STAR_PX[size];
  const tapPx = Math.max(starPx, size === "lg" ? 48 : 44);
  // 「該当なし」選択中は★を点灯させない
  const active = notApplicable ? 0 : (hover ?? value ?? 0);

  // ★を選んだら「該当なし」は自動解除する
  function setStar(star: number | null) {
    if (star !== null) onNotApplicableChange?.(false);
    onChange(star);
  }

  function handleClick(star: number) {
    // 同じ星を再クリック → 未評価に戻す
    setStar(value === star ? null : star);
  }

  function toggleNotApplicable() {
    const next = !notApplicable;
    onNotApplicableChange?.(next);
    // 「該当なし」を選んだら★はクリア（保存上は NULL = 未評価と同じ）
    if (next) onChange(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setStar(Math.min(5, (value ?? 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (value ?? 0) - 1;
      setStar(next < 1 ? null : next);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn(
          "flex items-center gap-1 transition-opacity",
          notApplicable && "opacity-40",
        )}
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
      {allowNotApplicable && (
        <button
          type="button"
          aria-pressed={notApplicable}
          onClick={toggleNotApplicable}
          className={cn(
            "rounded-pill border px-3 py-1 text-body-sm transition-colors",
            notApplicable
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          該当なし
        </button>
      )}
      {!allowNotApplicable && value !== null && (
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
