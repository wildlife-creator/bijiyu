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
  /** 稼働期間（職人が実際に働く期間） */
  workStartDate: string | null;
  workEndDate: string | null;
  /** 掲載終了(status='closed')案件のとき true。「掲載終了」バッジを表示する */
  isClosed?: boolean;
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
  workStartDate,
  workEndDate,
  isClosed = false,
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {tradeTypes.length > 0 ? (
            <SummaryWithOthers items={tradeTypes} maxVisible={2} />
          ) : (
            "—"
          )}
          {headcount ? `・${headcount}名` : ""}
        </span>
        {/* 職種が長い場合は折り返して次の行に右寄せで表示（重なり防止） */}
        <span className="ml-auto shrink-0 whitespace-nowrap">
          応募締め切り：{formatDate(recruitEndDate)}
        </span>
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
            <span className="w-14 text-xs text-primary/70">稼働期間</span>
            <span className="text-sm">
              {workStartDate && workEndDate
                ? `${formatDate(workStartDate)}〜${formatDate(workEndDate)}`
                : "未定"}
            </span>
          </div>
        </div>

        {/* Right (PC) / Below (SP):
            未対応(pending)のまま案件が掲載終了した場合はボタンを出さず案内のみ
            （応募のしようがないため）。承諾済み/辞退済みは履歴として
            「スカウトを受けました/断りました」を残す = ScoutActionButtons に委ねる。 */}
        {isClosed && scoutStatus === "pending" ? (
          <p className="text-sm font-medium text-muted-foreground md:self-end md:text-right">
            掲載を終了しました
          </p>
        ) : (
          <ScoutActionButtons
            showScoutActions={showScoutActions}
            scoutStatus={scoutStatus}
            messageId={messageId}
            jobId={jobId}
          />
        )}
      </div>
    </div>
  );
}
