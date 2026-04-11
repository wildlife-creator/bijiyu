import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { ScoutActionButtons } from "./scout-action-buttons";

interface ScoutInfoCardProps {
  jobId: string;
  title: string;
  tradeType: string | null;
  headcount: number | null;
  recruitEndDate: string | null;
  rewardLower: number | null;
  rewardUpper: number | null;
  prefecture: string | null;
  recruitStartDate: string | null;
  // Scout action props
  showScoutActions: boolean;
  scoutStatus: string | null;
  messageId: string;
}

export function ScoutInfoCard({
  jobId,
  title,
  tradeType,
  headcount,
  recruitEndDate,
  rewardLower,
  rewardUpper,
  prefecture,
  recruitStartDate,
  showScoutActions,
  scoutStatus,
  messageId,
}: ScoutInfoCardProps) {
  const rewardText =
    rewardLower && rewardUpper
      ? `${rewardLower.toLocaleString()}〜${rewardUpper.toLocaleString()}円（人工）`
      : rewardLower
        ? `${rewardLower.toLocaleString()}円〜（人工）`
        : "—";

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
          {tradeType || "—"}
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
            <span className="text-sm">{prefecture || "—"}</span>
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
