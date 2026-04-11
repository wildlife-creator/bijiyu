import { Badge } from "@/components/ui/badge";
import { formatBubbleTime } from "@/lib/utils/format-message-time";
import { ScoutInfoCard } from "./scout-info-card";

interface ScoutJobInfo {
  id: string;
  title: string;
  tradeType: string | null;
  headcount: number | null;
  recruitEndDate: string | null;
  rewardLower: number | null;
  rewardUpper: number | null;
  prefecture: string | null;
  recruitStartDate: string | null;
}

interface MessageBubbleProps {
  messageId: string;
  body: string;
  signedImageUrl?: string | null;
  createdAt: string;
  isMine: boolean;
  isScout: boolean;
  isProxy: boolean;
  isRead: boolean;
  scoutStatus?: string | null;
  scoutJob?: ScoutJobInfo | null;
  showScoutActions: boolean;
  showProxyBadge: boolean;
  senderAvatarUrl?: string | null;
  senderName?: string;
}

export function MessageBubble({
  messageId,
  body,
  signedImageUrl,
  createdAt,
  isMine,
  isScout,
  isProxy,
  isRead,
  scoutStatus,
  scoutJob,
  showScoutActions,
  showProxyBadge,
  senderAvatarUrl,
  senderName,
}: MessageBubbleProps) {
  return (
    <div className="mb-4">
      {/* Message bubble */}
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        {!isMine && (
          <div className="mr-2 flex-shrink-0">
            {senderAvatarUrl ? (
              <img
                src={senderAvatarUrl}
                alt={senderName || ""}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <span className="text-xs text-muted-foreground">
                  {senderName?.charAt(0) || "?"}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="max-w-[75%]">
          <div
            className={`relative rounded-[8px] p-3 ${
              isMine ? "bg-[#F0E2EF]" : "bg-white"
            }`}
          >
            {/* Bubble tail */}
            <span
              className={`absolute top-3 h-3 w-3 rotate-45 ${
                isMine
                  ? "-right-1 bg-[#F0E2EF]"
                  : "-left-1 bg-white"
              }`}
            />
            {(isScout || (isProxy && showProxyBadge)) && (
              <div className="mb-1.5 flex gap-1">
                {isScout && (
                  <Badge className="rounded-full bg-primary px-2 py-0 text-[10px] text-white hover:bg-primary">
                    スカウト
                  </Badge>
                )}
                {isProxy && showProxyBadge && (
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-muted px-2 py-0 text-[10px] text-muted-foreground"
                  >
                    代理
                  </Badge>
                )}
              </div>
            )}
            {signedImageUrl && (
              <img
                src={signedImageUrl}
                alt="添付画像"
                className="mb-2 max-w-full rounded"
              />
            )}
            <p className="whitespace-pre-wrap break-words text-sm">{body}</p>
          </div>
          <div
            className={`mt-1 flex items-center gap-1 ${isMine ? "justify-end" : "justify-start"}`}
          >
            <span className="text-[10px] text-muted-foreground">
              {formatBubbleTime(createdAt)}
            </span>
            {isMine && isRead && (
              <span className="text-[10px] text-muted-foreground">既読</span>
            )}
          </div>
        </div>
      </div>

      {/* Scout info card with action buttons inside (inline, per-message) */}
      {isScout && scoutJob && (
        <ScoutInfoCard
          jobId={scoutJob.id}
          title={scoutJob.title}
          tradeType={scoutJob.tradeType}
          headcount={scoutJob.headcount}
          recruitEndDate={scoutJob.recruitEndDate}
          rewardLower={scoutJob.rewardLower}
          rewardUpper={scoutJob.rewardUpper}
          prefecture={scoutJob.prefecture}
          recruitStartDate={scoutJob.recruitStartDate}
          showScoutActions={showScoutActions}
          scoutStatus={scoutStatus ?? null}
          messageId={messageId}
        />
      )}
    </div>
  );
}
