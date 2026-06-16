"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface MemberItem {
  userId: string;
  name: string;
  email: string;
  orgRoleLabel: string;
  isPending: boolean;
  isProxy: boolean;
}

/**
 * ADM-004 の担当者一覧。
 * 件数が多くなりすぎないよう「主要 N 名 + もっと見る」で折りたたむ
 * （募集現場一覧 JobSiteList と同じ UX・初期5名表示＝6人目から折りたたみ）。
 */
export function MemberList({
  members,
  initialLimit = 5,
}: {
  members: MemberItem[];
  initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (members.length === 0) {
    return (
      <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
        <p className="px-4 py-4 text-body-sm text-muted-foreground">
          担当者はいません
        </p>
      </div>
    );
  }

  const visible = expanded ? members : members.slice(0, initialLimit);
  const hasMore = members.length > initialLimit;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {visible.map((m) => (
          <div
            key={m.userId}
            className="border-b border-border/20 px-4 py-3 last:border-b-0"
          >
            <p className="flex items-center gap-2 text-body-md font-medium text-foreground">
              {m.name}
              {m.isPending && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-body-xs font-normal text-primary">
                  招待中
                </span>
              )}
              {m.isProxy && (
                <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-body-xs font-normal text-secondary">
                  代理
                </span>
              )}
            </p>
            <p className="truncate text-body-sm text-muted-foreground">
              {m.email}
            </p>
            <p className="text-body-sm text-muted-foreground">
              権限: {m.orgRoleLabel}
            </p>
          </div>
        ))}
      </div>
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="text-body-sm text-primary"
        >
          {expanded ? "折りたたむ" : `もっと見る（残り${members.length - initialLimit}名）`}
        </Button>
      )}
    </div>
  );
}
