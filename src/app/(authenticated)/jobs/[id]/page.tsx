import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
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
      <Badge className="rounded-sm bg-secondary text-secondary-foreground">
        {label}
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge className="rounded-sm bg-destructive text-destructive-foreground">
        {label}
      </Badge>
    );
  }
  return (
    <Badge className="rounded-sm bg-muted text-muted-foreground">
      {label}
    </Badge>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return dateStr.replace(/-/g, "/");
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex border-b border-border py-3">
      <span className="w-28 shrink-0 text-body-md font-medium text-primary">
        {label}
      </span>
      <span className="flex-1 text-body-md text-foreground">{value}</span>
    </div>
  );
}

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch job
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) {
    notFound();
  }

  // Fetch images
  const { data: images } = await supabase
    .from("job_images")
    .select("*")
    .eq("job_id", id)
    .order("sort_order", { ascending: true });

  // Fetch application count
  const { count: applicationCount } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("job_id", id);

  // Check urgent option
  const { data: urgentOption } = await supabase
    .from("option_subscriptions")
    .select("id")
    .eq("job_id", id)
    .eq("option_type", "urgent")
    .eq("status", "active")
    .maybeSingle();

  return (
    <div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">
      {/* Header with status action */}
      <div className="flex items-center justify-between">
        <h1 className="text-heading-lg font-bold text-primary">
          募集現場詳細
        </h1>
        {job.status === "open" && (
          <button className="text-body-sm text-destructive hover:underline">
            掲載を終了する
          </button>
        )}
      </div>

      {/* Status badge */}
      <div className="mt-2">
        <StatusBadge status={job.status} />
        {urgentOption && (
          <Badge className="ml-2 rounded-sm bg-destructive text-destructive-foreground">
            急募
          </Badge>
        )}
      </div>

      {/* Title */}
      <h2 className="mt-4 text-heading-md font-bold text-foreground">
        {job.title}
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">
        {job.description}
      </p>

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="rounded-[47px] border-primary text-primary"
          asChild
        >
          <Link href={`/applications/manage?jobId=${id}`}>応募者をみる</Link>
        </Button>
        <Button
          size="sm"
          className="rounded-[47px] bg-secondary text-secondary-foreground hover:bg-secondary/90"
          asChild
        >
          <Link href={`/jobs/${id}/edit`}>編集する</Link>
        </Button>
      </div>

      {/* Detail rows */}
      <div className="mt-4">
        <DetailRow label="職種" value={job.trade_type} />
        <DetailRow
          label="報酬"
          value={
            job.reward_lower && job.reward_upper
              ? `${job.reward_lower.toLocaleString()}〜${job.reward_upper.toLocaleString()}円（人工）`
              : null
          }
        />
        <DetailRow label="エリア" value={job.prefecture} />
        <DetailRow label="住所" value={job.address} />
        <DetailRow label="勤務地" value={job.location} />
        <DetailRow label="募集人数" value={job.headcount ? `${job.headcount}人` : null} />
        <DetailRow
          label="工期"
          value={
            job.work_start_date && job.work_end_date
              ? `${formatDate(job.work_start_date)}〜${formatDate(job.work_end_date)}`
              : null
          }
        />
        <DetailRow
          label="募集期間"
          value={
            job.recruit_start_date && job.recruit_end_date
              ? `${formatDate(job.recruit_start_date)}〜${formatDate(job.recruit_end_date)}`
              : null
          }
        />
        <DetailRow label="稼働時間" value={job.work_hours} />
        <DetailRow label="経験年数" value={job.experience_years} />
        <DetailRow label="スキル" value={job.required_skills} />
        <DetailRow label="国籍・言語" value={job.nationality_language} />
        <DetailRow label="持ち物" value={job.items} />
        <DetailRow label="スケジュール" value={job.schedule_detail} />
        <DetailRow label="請負案件詳細" value={job.project_details} />
        <DetailRow label="発注者メッセージ" value={job.owner_message} />
        <DetailRow label="詳細その他" value={job.etc_message} />
      </div>

      {/* Images */}
      {images && images.length > 0 && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">添付画像</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {images.map((img) => (
              <img
                key={img.id}
                src={img.image_url}
                alt="案件画像"
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {/* Application count */}
      <section className="mt-6">
        <Link
          href={`/applications/manage?jobId=${id}`}
          className="flex items-center justify-between rounded-[8px] border border-border p-4 transition-colors hover:bg-muted/50"
        >
          <span className="text-body-md font-medium text-foreground">
            応募者数：{applicationCount ?? 0}件
          </span>
          <span className="text-body-sm font-medium text-secondary">一覧を見る →</span>
        </Link>
      </section>

      {/* Copy and create new */}
      <div className="mt-6">
        <Button
          className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
          asChild
        >
          <Link href={`/jobs/create?copyFrom=${id}`}>
            コピーして新規作成する
          </Link>
        </Button>
      </div>

      {/* Back button */}
      <div className="mt-4 flex justify-center">
        <Button
          variant="outline"
          size="lg"
          className="w-full rounded-[47px] border-primary text-primary"
          asChild
        >
          <Link href="/jobs/manage">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
