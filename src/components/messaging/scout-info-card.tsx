import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { SummaryWithOthers } from "@/components/master/summary-with-others";
import { AreaSummary } from "@/components/area/area-summary";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { formatRewardRange } from "@/lib/utils/format-reward";
import { ScoutActionButtons } from "./scout-action-buttons";

interface ScoutInfoCardProps {
  jobId: string;
  title: string;
  tradeTypes: string[];
  headcount: number | null;
  recruitEndDate: string | null;
  rewardLower: number | null;
  rewardUpper: number | null;
  /** master-area: スカウト対象案件のエリア配列 */
  areas: AreaForDisplay[];
  recruitStartDate: string | null;
  // Scout action props
  showScoutActions: boolean;
  scoutStatus: string | null;
  messageId: string;
}

export function ScoutInfoCard({
  jobId,
  title,
  tradeTypes,
  headcount,
  recruitEndDate,
  rewardLower,
  rewardUpper,
  areas,
  recruitStartDate,
  showScoutActions,
  scoutStatus,
  messageId,
}: ScoutInfoCardProps) {
  const rewardText = formatRewardRange(rewardLower, rewardUpper, {
    emptyLabel: "—",
  });

  return (
    <div className="mx-4 my-3 rounded-[8px] border border-border bg-white p-4">
      {/* Title + link arrow */}
      <Link
        href={`/jobs/${jobId}`}
        className="mb-1 flex items-start justify-between"
      >
        <h3 className="text-sm font-bold">{title}</h3>
        <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
      </Link>

      {/* Trade type + deadline */}
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {tradeTypes.length > 0 ? (
            <SummaryWithOthers items={tradeTypes} maxVisible={2} />
          ) : (
            "—"
          )}
          {headcount ? `・${headcount}名` : ""}
        </span>
        <span>締め切り：{formatDate(recruitEndDate)}</span>
      </div>

      <div className="border-t border-border pt-3" />

      {/* Job details + buttons side by side on PC, stacked on SP */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        {/* Left: job info */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <img
              src="/images/icons/icon-coin.png"
              alt=""
              className="h-4 w-4"
            />
            <span className="w-14 text-xs text-primary/70">報酬</span>
            <span className="text-sm">{rewardText}</span>
          </div>
          <div className="flex items-center gap-2">
            <img
              src="/images/icons/icon-pin.png"
              alt=""
              className="h-4 w-4"
            />
            <span className="w-14 text-xs text-primary/70">エリア</span>
            <AreaSummary areas={areas} className="text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <img
              src="/images/icons/icon-calendar.png"
              alt=""
              className="h-4 w-4"
            />
            <span className="w-14 text-xs text-primary/70">募集期間</span>
            <span className="text-sm">
              {formatDate(recruitStartDate)}〜{formatDate(recruitEndDate)}
            </span>
          </div>
        </div>

        {/* Right (PC) / Below (SP): scout action buttons inside card */}
        <ScoutActionButtons
          showScoutActions={showScoutActions}
          scoutStatus={scoutStatus}
          messageId={messageId}
          jobId={jobId}
        />
      </div>
    </div>
  );
}
