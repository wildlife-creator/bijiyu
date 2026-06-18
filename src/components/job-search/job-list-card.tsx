import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { JobThumbnail } from "@/components/job-search/job-thumbnail";
import { SummaryWithOthers } from "@/components/master/summary-with-others";
import { AreaSummary } from "@/components/area/area-summary";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { formatRewardRange } from "@/lib/utils/format-reward";

interface JobListCardProps {
  job: {
    id: string;
    title: string;
    tradeTypes: string[];
    /** master-area: 案件のエリア配列。空配列の場合は「エリア未設定」表示 */
    areas: AreaForDisplay[];
    rewardLower: number | null;
    rewardUpper: number | null;
    isUrgent: boolean;
    recruitEndDate: string;
    companyName: string | null;
    thumbnailUrl: string | null;
  };
  isFavorited: boolean;
  /** Use "text" for list pages, "icon" (default) for detail-like contexts */
  favoriteVariant?: "icon" | "text";
}

export function JobListCard({ job, isFavorited, favoriteVariant = "text" }: JobListCardProps) {
  return (
    <Card className="overflow-hidden rounded-[8px]">
      {/* Thumbnail */}
      <div className="relative aspect-[16/9] bg-muted">
        <JobThumbnail src={job.thumbnailUrl} alt={job.title} />
        {job.isUrgent && (
          <Badge className="absolute top-2 left-2 rounded-[33px] bg-destructive text-destructive-foreground">
            急募
          </Badge>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Title & Company */}
        <div>
          <h3 className="text-body-lg font-semibold line-clamp-2">
            {job.title}
          </h3>
          {job.companyName && (
            <p className="text-body-sm text-muted-foreground mt-1">
              {job.companyName}
            </p>
          )}
        </div>

        {/* Info rows */}
        <div className="space-y-1.5 text-body-sm">
          <div className="flex items-center">
            <img
              src="/images/icons/icon-briefcase.png"
              alt=""
              className="w-4 h-4 shrink-0"
            />
            <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">募集職種</span>
            <SummaryWithOthers items={job.tradeTypes} maxVisible={2} />
          </div>
          <div className="flex items-center">
            <img
              src="/images/icons/icon-coin.png"
              alt=""
              className="w-4 h-4 shrink-0"
            />
            <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">報酬</span>
            <span>
              {formatRewardRange(job.rewardLower, job.rewardUpper, {
                emptyLabel: "要相談",
              })}
            </span>
          </div>
          <div className="flex items-center">
            <img
              src="/images/icons/icon-pin.png"
              alt=""
              className="w-4 h-4 shrink-0"
            />
            <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">エリア</span>
            <AreaSummary areas={job.areas} className="line-clamp-1" />
          </div>
          <div className="flex items-center">
            <img
              src="/images/icons/icon-calendar.png"
              alt=""
              className="w-4 h-4 shrink-0"
            />
            <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">募集期間</span>
            <span>〜{job.recruitEndDate.replace(/-/g, "/")}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <FavoriteButton
            targetType="job"
            targetId={job.id}
            initialIsFavorited={isFavorited}
            variant={favoriteVariant}
          />
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-[47px] border-primary text-primary hover:bg-primary/10"
          >
            <Link href={`/jobs/${job.id}`}>詳細をみる</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
