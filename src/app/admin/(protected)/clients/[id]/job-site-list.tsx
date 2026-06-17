"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface JobSiteItem {
  id: string;
  title: string;
  statusLabel: string;
  applicationCount: number;
}

/**
 * ADM-004 の募集現場一覧。
 * 件数が多くなりすぎないよう「主要 N 件 + もっと見る」で折りたたむ
 * （基本情報の CollapsibleList と同じ UX。各行に詳細／応募リンクを持つため専用化）。
 */
export function JobSiteList({
  jobs,
  initialLimit = 5,
  backToValue,
}: {
  jobs: JobSiteItem[];
  initialLimit?: number;
  /** ADM-022 / ADM-013 へリンクする際に渡す backTo クエリの値（=ADM-004 自身の URL） */
  backToValue: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (jobs.length === 0) {
    return (
      <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
        <p className="px-4 py-4 text-body-sm text-muted-foreground">
          掲載案件はありません
        </p>
      </div>
    );
  }

  const visible = expanded ? jobs : jobs.slice(0, initialLimit);
  const hasMore = jobs.length > initialLimit;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {visible.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0"
          >
            <Link
              href={`/admin/jobs/${job.id}?backTo=${encodeURIComponent(backToValue)}`}
              className="min-w-0 flex-1 hover:underline"
            >
              <p className="truncate text-body-md font-medium text-foreground">
                {job.title}
              </p>
              <span className="text-body-xs text-muted-foreground">
                {job.statusLabel}
              </span>
            </Link>
            <Link
              href={`/admin/applications?jobId=${job.id}&backTo=${encodeURIComponent(backToValue)}`}
              className="shrink-0 text-body-sm text-secondary underline underline-offset-2"
            >
              応募 {job.applicationCount}件
            </Link>
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
          {expanded ? "折りたたむ" : `もっと見る（残り${jobs.length - initialLimit}件）`}
        </Button>
      )}
    </div>
  );
}
