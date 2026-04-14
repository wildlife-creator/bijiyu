"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { JobThumbnail } from "@/components/job-search/job-thumbnail";
import { formatDate } from "@/lib/utils/format-date";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Job {
  id: string;
  title: string;
  trade_type: string | null;
  prefecture: string | null;
  reward_lower: number | null;
  reward_upper: number | null;
  recruit_end_date: string | null;
  recruit_start_date: string | null;
  headcount: number | null;
  status: "draft" | "open" | "closed";
  is_urgent: boolean;
  created_at: string;
  thumbnailUrl: string | null;
  companyName: string | null;
}

interface JobListClientProps {
  jobs: Job[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  statusFilter: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "下書き保存",
  open: "掲載中",
  closed: "掲載終了",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;

  if (status === "open") {
    return (
      <Badge className="rounded-[33px] bg-primary text-primary-foreground">
        {label}
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge className="rounded-[33px] bg-muted text-muted-foreground">
        {label}
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge className="rounded-[33px] bg-destructive text-destructive-foreground">
        {label}
      </Badge>
    );
  }
  return <Badge variant="outline">{label}</Badge>;
}

function formatReward(lower: number | null, upper: number | null): string {
  if (lower && upper) {
    return `${lower.toLocaleString()}〜${upper.toLocaleString()}円`;
  }
  if (lower) return `${lower.toLocaleString()}円〜`;
  if (upper) return `〜${upper.toLocaleString()}円`;
  return "—";
}

export function JobListClient({
  jobs,
  totalCount,
  currentPage,
  totalPages,
  statusFilter,
}: JobListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleStatusChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    params.delete("page");
    router.push(`/jobs/manage?${params.toString()}`);
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    router.push(`/jobs/manage?${params.toString()}`);
  }

  return (
    <>
      {/* Filter row */}
      <div className="mt-6 flex items-center justify-between">
        <span className="text-body-md text-foreground">
          全{totalCount}件
        </span>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[120px] rounded-lg">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="open">掲載中</SelectItem>
              <SelectItem value="draft">下書き</SelectItem>
              <SelectItem value="closed">掲載終了</SelectItem>
            </SelectContent>
          </Select>
          <img
            src="/images/icons/icon-sort.png"
            alt="並び替え"
            className="size-5"
          />
        </div>
      </div>

      {/* Job card grid */}
      {jobs.length === 0 ? (
        <p className="mt-8 py-12 text-center text-body-md text-muted-foreground">
          案件がありません
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Card key={job.id} className="overflow-hidden rounded-[8px] border-border">
              {/* Thumbnail area */}
              <div className="relative aspect-[16/9] w-full bg-muted">
                <JobThumbnail src={job.thumbnailUrl} alt={job.title} />
                {/* Status badge overlay */}
                <div className="absolute left-2 top-2 flex gap-1">
                  <StatusBadge status={job.status} />
                  {job.is_urgent && (
                    <Badge className="rounded-[33px] bg-destructive text-destructive-foreground">
                      急募
                    </Badge>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div className="space-y-3 p-4">
                <div className="space-y-1.5">
                  <h3 className="line-clamp-2 text-body-lg font-semibold text-foreground">
                    {job.title}
                  </h3>
                  {job.companyName && (
                    <p className="text-body-sm text-muted-foreground">
                      {job.companyName}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 text-body-sm">
                  {job.trade_type && (
                    <div className="flex items-center">
                      <img src="/images/icons/icon-briefcase.png" alt="" className="w-4 h-4 shrink-0" />
                      <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">募集職種</span>
                      <span>{job.trade_type}</span>
                    </div>
                  )}
                  <div className="flex items-center">
                    <img src="/images/icons/icon-coin.png" alt="" className="w-4 h-4 shrink-0" />
                    <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">報酬</span>
                    <span>{formatReward(job.reward_lower, job.reward_upper)}（人工）</span>
                  </div>
                  {job.prefecture && (
                    <div className="flex items-center">
                      <img src="/images/icons/icon-pin.png" alt="" className="w-4 h-4 shrink-0" />
                      <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">エリア</span>
                      <span>{job.prefecture}</span>
                    </div>
                  )}
                  {job.recruit_start_date && job.recruit_end_date && (
                    <div className="flex items-center">
                      <img src="/images/icons/icon-calendar.png" alt="" className="w-4 h-4 shrink-0" />
                      <span className="ml-1.5 w-16 shrink-0 text-muted-foreground">募集期間</span>
                      <span>
                        {formatDate(job.recruit_start_date, "")}〜
                        {formatDate(job.recruit_end_date, "")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-[47px] border-primary text-primary hover:bg-primary/10"
                  >
                    <Link href={`/jobs/${job.id}?manage=true`}>詳細をみる</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-[33px]"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            前へ
          </Button>
          <span className="text-body-md text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-[33px]"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            次へ
          </Button>
        </div>
      )}
    </>
  );
}
