import { Card, CardContent } from "@/components/ui/card";
import { StarRatingDisplay } from "@/components/shared/star-rating-display";
import { RATING_ITEMS } from "@/lib/constants/rating";
import type { OverallSummary, PerItemSummary } from "@/lib/rating/aggregate";

// RATING_ITEMS の snake_case key → PerItemSummary の camelCase プロパティ名
function summaryKeyOf(key: string): keyof PerItemSummary {
  return key
    .replace(/^rating_/, "")
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof PerItemSummary;
}

interface RatingSummaryCardProps {
  perItem: PerItemSummary;
}

/**
 * 発注者→受注者評価の7項目サマリーカード（★平均 + 件数。任意項目0件は「未評価」）。
 * 評価詳細ページ（/users/[id]/reviews）と ADM-009 で共用する。
 */
export function RatingSummaryCard({ perItem }: RatingSummaryCardProps) {
  return (
    <Card className="rounded-[8px]">
      <CardContent className="p-4">
        <div className="space-y-0">
          {RATING_ITEMS.map((item) => {
            const summary: OverallSummary = perItem[summaryKeyOf(item.key)];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <span className="text-body-md text-foreground">
                  {item.label}
                </span>
                {summary.count === 0 ? (
                  <span className="text-body-sm text-muted-foreground">
                    未評価
                  </span>
                ) : (
                  <StarRatingDisplay
                    avg={summary.avg}
                    count={summary.count}
                    size="sm"
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
