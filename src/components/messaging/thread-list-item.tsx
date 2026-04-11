import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatMessageTime } from "@/lib/utils/format-message-time";

interface ThreadListItemProps {
  threadId: string;
  participantName: string;
  participantAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  threadType: string;
  unreadCount: number;
}

export function ThreadListItem({
  threadId,
  participantName,
  participantAvatarUrl,
  lastMessageBody,
  lastMessageAt,
  threadType,
  unreadCount,
}: ThreadListItemProps) {
  return (
    <Link
      href={`/messages/${threadId}`}
      className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/30"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {participantAvatarUrl ? (
          <img
            src={participantAvatarUrl}
            alt={participantName}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <span className="text-sm text-muted-foreground">
              {participantName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {participantName}
          </span>
          {threadType === "scout" && (
            <Badge
              variant="secondary"
              className="flex-shrink-0 rounded-full bg-muted px-2 py-0 text-[10px] text-muted-foreground"
            >
              スカウト
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {lastMessageBody || "メッセージはありません"}
        </p>
      </div>

      {/* Right: time + unread */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <span className="text-[10px] text-muted-foreground">
          {formatMessageTime(lastMessageAt)}
        </span>
        {unreadCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    </Link>
  );
}
