import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarRatingDisplayProps {
  avg: number | null;
  count: number;
  layout?: "stars-with-text" | "text-only";
  size?: "sm" | "md" | "lg";
}

const STAR_PX: Record<NonNullable<StarRatingDisplayProps["size"]>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

/** 表示値は小数第一位（fill は四捨五入した整数） */
function formatAvg(avg: number): string {
  return (Math.round(avg * 10) / 10).toFixed(1);
}

/**
 * ★平均 + 件数の読み取り専用表示。
 * - avg=null または count=0 → 「まだ評価がありません」
 * - stars-with-text: ★アイコン5つ + 「X.X（N件）」
 * - text-only: 「★平均 X.X（N件）」（CLI-005 バッジ補足用）
 */
export function StarRatingDisplay({
  avg,
  count,
  layout = "stars-with-text",
  size = "md",
}: StarRatingDisplayProps) {
  if (avg === null || count === 0) {
    return (
      <span className="text-body-sm text-muted-foreground">
        まだ評価がありません
      </span>
    );
  }

  const display = formatAvg(avg);

  if (layout === "text-only") {
    return (
      <span className="text-body-sm text-muted-foreground">
        ★平均 {display}（{count}件）
      </span>
    );
  }

  const filled = Math.round(avg);
  const starPx = STAR_PX[size];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            style={{ width: starPx, height: starPx }}
            className={cn(
              star <= filled
                ? "fill-secondary text-secondary"
                : "fill-none text-gray-300",
            )}
          />
        ))}
      </span>
      <span className="text-body-md font-bold text-foreground">{display}</span>
      <span className="text-body-sm text-muted-foreground">（{count}件）</span>
    </span>
  );
}
