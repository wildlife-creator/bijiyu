"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera } from "lucide-react";

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
      <Badge className="rounded-[33px] bg-secondary text-secondary-foreground">
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.replace(/-/g, "/");
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
            <Link key={job.id} href={`/jobs/${job.id}`} className="block">
              <Card className="overflow-hidden rounded-[8px] border-border transition-shadow hover:shadow-md">
                {/* Thumbnail area */}
                <div className="relative aspect-[16/9] w-full bg-muted">
                  {job.thumbnailUrl ? (
                    <img
                      src={job.thumbnailUrl}
                      alt={job.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Camera className="size-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {/* Status badge overlay */}
                  <div className="absolute left-2 top-2">
                    <StatusBadge status={job.status} />
                  </div>
                </div>

                {/* Card body */}
                <div className="space-y-1.5 p-4">
                  <h3 className="line-clamp-2 text-body-lg font-semibold text-foreground">
                    {job.title}
                  </h3>
                  {job.companyName && (
                    <p className="text-body-sm text-muted-foreground">
                      {job.companyName}
                    </p>
                  )}
                  <div className="space-y-0.5 text-body-sm text-muted-foreground">
                    {job.trade_type && (
                      <p>職種：{job.trade_type}</p>
                    )}
                    <p>報酬：{formatReward(job.reward_lower, job.reward_upper)}（人工）</p>
                    {job.prefecture && (
                      <p>エリア：{job.prefecture}</p>
                    )}
                    {job.recruit_start_date && job.recruit_end_date && (
                      <p>
                        募集：{formatDate(job.recruit_start_date)}〜
                        {formatDate(job.recruit_end_date)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
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
