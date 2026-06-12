import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AreaList } from "@/components/area/area-list";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { SafeImage } from "@/components/job-search/safe-image";
import { BackButton } from "@/components/shared/back-button";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { formatDate } from "@/lib/utils/format-date";
import { formatRewardRange } from "@/lib/utils/format-reward";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  open: "掲載中",
  closed: "掲載終了",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  if (status === "open") {
    return (
      <Badge className="rounded-sm bg-primary text-primary-foreground">
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
    <Badge className="rounded-sm bg-muted text-muted-foreground">{label}</Badge>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
}) {
  const isString = typeof value === "string";
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <p className="bg-muted px-4 py-2 text-body-sm font-medium text-muted-foreground">
        {label}
      </p>
      <div className="px-4 py-3 text-body-md text-foreground">
        {value == null || (isString && !value) ? "—" : value}
      </div>
    </div>
  );
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return `${start ? formatDate(start) : "—"}〜${end ? formatDate(end) : "—"}`;
}

/**
 * ADM-022: 募集現場詳細（admin 閲覧専用）。
 * デザインカンプなし（CON-003 のセクション構成を参考に admin 共通スタイルで実装）。
 *
 * データ取得は admin client で独立（既存の発注者画面 CLI-002 等に分岐を足さない＝案B）。
 * 発注者操作（編集・発注）は持たない。
 */
export default async function AdminJobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: job } = await admin
    .from("jobs")
    .select(
      `
      *,
      owner:users!owner_id(
        last_name, first_name, deleted_at,
        client_profiles(display_name, image_url)
      ),
      organization:organizations(
        owner_id,
        owner_user:users!owner_id(
          last_name, first_name, deleted_at,
          client_profiles(display_name, image_url)
        )
      )
    `,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: images }, { data: areaRows }] = await Promise.all([
    admin
      .from("job_images")
      .select("id, image_url")
      .eq("job_id", id)
      .order("sort_order", { ascending: true }),
    admin.from("job_areas").select("prefecture, municipality").eq("job_id", id),
  ]);

  const jobAreas: AreaForDisplay[] = (areaRows ?? []).map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));

  // 発注者名と ADM-004 への遷移先は契約主体（法人= org Owner / 個人・小規模= owner_id）
  const ownerResolution = resolveClientProfileForRow(job);
  const ownerName = resolveParticipantName({
    displayName: ownerResolution.displayName,
    lastName: ownerResolution.lastName,
    firstName: ownerResolution.firstName,
    deletedAt: ownerResolution.deletedAt,
  });
  const clientSubjectId = job.organization_id
    ? (job.organization?.owner_id ?? job.owner_id)
    : job.owner_id;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        募集現場詳細
      </h1>

      {/* ステータス */}
      <div className="mt-4">
        <StatusBadge status={job.status} />
        {job.is_urgent && (
          <Badge className="ml-2 rounded-sm bg-destructive text-destructive-foreground">
            急募
          </Badge>
        )}
      </div>

      {/* タイトル＋発注者名 */}
      <h2 className="mt-3 text-heading-md font-bold text-foreground">
        {job.title}
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground">{ownerName}</p>

      {/* 案件内容 */}
      <section className="mt-6">
        <h3 className="text-body-lg font-bold text-foreground">案件内容</h3>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow
            label="募集職種"
            value={
              job.trade_types.length > 0 ? (
                <CollapsibleList items={job.trade_types} initialLimit={5} />
              ) : null
            }
          />
          <DetailRow
            label="募集人数"
            value={job.headcount ? `${job.headcount}人` : null}
          />
          <DetailRow
            label="報酬"
            value={formatRewardRange(job.reward_lower, job.reward_upper)}
          />
          <DetailRow
            label="募集期間"
            value={formatDateRange(job.recruit_start_date, job.recruit_end_date)}
          />
          <DetailRow
            label="工事期間"
            value={formatDateRange(job.work_start_date, job.work_end_date)}
          />
          <DetailRow
            label="エリア"
            value={jobAreas.length > 0 ? <AreaList areas={jobAreas} /> : null}
          />
          <DetailRow
            label="詳細"
            value={
              job.description ? (
                <span className="whitespace-pre-wrap">{job.description}</span>
              ) : null
            }
          />
        </div>
      </section>

      {/* 添付画像 */}
      {(images ?? []).length > 0 && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">添付画像</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {(images ?? []).map((img) => (
              <SafeImage
                key={img.id}
                src={img.image_url}
                alt="案件画像"
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {/* 導線 */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          asChild
          className="w-full max-w-xs rounded-full bg-primary text-white hover:bg-primary/90"
        >
          <Link href={`/admin/applications?jobId=${id}`}>応募一覧</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full border-secondary text-secondary"
        >
          <Link href={`/admin/clients/${clientSubjectId}`}>発注者詳細</Link>
        </Button>
        <BackButton className="max-w-xs" />
      </div>
    </div>
  );
}
