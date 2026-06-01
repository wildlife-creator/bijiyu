import { Badge } from "@/components/ui/badge";
import { StarRatingDisplay } from "@/components/shared/star-rating-display";
import { judgeHighRating } from "@/lib/rating/judge-high-rating";
import type { OverallSummary } from "@/lib/rating/aggregate";

export interface HighRatingBadgeProps {
  summary: OverallSummary;
}

/**
 * CLI-005 カード上部の「高評価」バッジ + 補足テキスト。
 * 条件（件数3以上 かつ ★平均4.0以上）を満たさなければ非表示（null）。
 * 黒地白文字バッジ + グレー補足の2要素構造（旧ハードコード踏襲）。
 */
export function HighRatingBadge({ summary }: HighRatingBadgeProps) {
  if (!judgeHighRating(summary)) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge className="rounded-sm bg-foreground text-background text-[10px] px-1.5 py-0.5">
        高評価
      </Badge>
      <StarRatingDisplay avg={summary.avg} count={summary.count} layout="text-only" />
    </div>
  );
}
