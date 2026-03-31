import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { JobThumbnail } from "@/components/job-search/job-thumbnail";

interface JobListCardProps {
  job: {
    id: string;
    title: string;
    tradeType: string;
    prefecture: string;
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

function formatReward(lower: number | null, upper: number | null): string {
  if (lower && upper) {
    return `${lower.toLocaleString()}円〜${upper.toLocaleString()}円（人工）`;
  }
  if (lower) return `${lower.toLocaleString()}円〜（人工）`;
  if (upper) return `〜${upper.toLocaleString()}円（人工）`;
  return "要相談";
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
          <div className="flex items-center gap-1.5">
            <img
              src="/images/icons/icon-briefcase.png"
              alt=""
              className="w-4 h-4"
            />
            <span className="text-muted-foreground">募集職種</span>
            <span>{job.tradeType}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <img
              src="/images/icons/icon-coin.png"
              alt=""
              className="w-4 h-4"
            />
            <span className="text-muted-foreground">報酬</span>
            <span>{formatReward(job.rewardLower, job.rewardUpper)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <img
              src="/images/icons/icon-pin.png"
              alt=""
              className="w-4 h-4"
            />
            <span className="text-muted-foreground">エリア</span>
            <span>{job.prefecture}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <img
              src="/images/icons/icon-calendar.png"
              alt=""
              className="w-4 h-4"
            />
            <span className="text-muted-foreground">募集期間</span>
            <span>〜{job.recruitEndDate}</span>
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
