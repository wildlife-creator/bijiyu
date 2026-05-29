import {
  HIGH_RATING_BADGE_MIN_AVG,
  HIGH_RATING_BADGE_MIN_COUNT,
} from "@/lib/constants/rating";
import type { OverallSummary } from "@/lib/rating/aggregate";

/**
 * CLI-005 高評価バッジの表示可否を判定する純粋関数。
 * 件数が閾値以上、かつ★平均が閾値以上のときのみ true。
 * 副作用なし・同じ入力で必ず同じ出力。
 */
export function judgeHighRating(summary: OverallSummary): boolean {
  if (summary.avg === null) return false;
  return (
    summary.count >= HIGH_RATING_BADGE_MIN_COUNT &&
    summary.avg >= HIGH_RATING_BADGE_MIN_AVG
  );
}
