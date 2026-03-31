import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { canApplyJob } from "@/lib/utils/can-apply-job";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { BackButton } from "@/components/job-search/back-button";
import { SafeImage } from "@/components/job-search/safe-image";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      <span className="w-28 shrink-0 text-body-md font-medium text-secondary">
        {label}
      </span>
      <span className="flex-1 text-body-md text-foreground">{value}</span>
    </div>
  );
}

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const isManageView = sp.manage === "true";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user data
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // Fetch job with owner info
  const { data: job } = await supabase
    .from("jobs")
    .select("*, users!jobs_owner_id_fkey(company_name)")
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

  const isOwner = job.owner_id === user.id;
  const ownerCompanyName =
    (job.users as unknown as { company_name: string | null })?.company_name ??
    null;

  // --- Owner view (CLI-002) --- only when accessed via ?manage=true from CLI-001
  if (isOwner && isManageView) {
    const { count: applicationCount } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("job_id", id);

    const { data: urgentOption } = await supabase
      .from("option_subscriptions")
      .select("id")
      .eq("job_id", id)
      .eq("option_type", "urgent")
      .eq("status", "active")
      .maybeSingle();

    return (
      <div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-heading-lg font-bold text-secondary">
            募集現場詳細
          </h1>
          {job.status === "open" && (
            <button className="text-body-sm text-destructive hover:underline">
              掲載を終了する
            </button>
          )}
        </div>

        <div className="mt-2">
          <StatusBadge status={job.status} />
          {urgentOption && (
            <Badge className="ml-2 rounded-sm bg-destructive text-destructive-foreground">
              急募
            </Badge>
          )}
        </div>

        <h2 className="mt-4 text-heading-md font-bold text-foreground">
          {job.title}
        </h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {job.description}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-[47px] border-secondary text-secondary"
            asChild
          >
            <Link href={`/applications/manage?jobId=${id}`}>応募者をみる</Link>
          </Button>
          <Button
            size="sm"
            className="rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            asChild
          >
            <Link href={`/jobs/${id}/edit`}>編集する</Link>
          </Button>
        </div>

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
          <DetailRow
            label="募集人数"
            value={job.headcount ? `${job.headcount}人` : null}
          />
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

        {images && images.length > 0 && (
          <section className="mt-6">
            <h3 className="text-body-lg font-bold text-foreground">
              添付画像
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              {images.map((img) => (
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

        <section className="mt-6">
          <Link
            href={`/applications/manage?jobId=${id}`}
            className="flex items-center justify-between rounded-[8px] border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <span className="text-body-md font-medium text-foreground">
              応募者数：{applicationCount ?? 0}件
            </span>
            <span className="text-body-sm font-medium text-primary">
              一覧を見る →
            </span>
          </Link>
        </section>

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

        <BackButton />
      </div>
    );
  }

  // --- Applicant view (CON-003) ---

  // Check favorite status
  const { data: favorite } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", "job")
    .eq("target_id", id)
    .maybeSingle();

  // Check application eligibility
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  const isPaidUser = !!subscription || userData?.role === "staff" || userData?.role === "client";

  let applyCheck: { canApply: boolean; reason?: string } = { canApply: true };

  if (!isPaidUser) {
    const { data: skills } = await supabase
      .from("user_skills")
      .select("trade_type")
      .eq("user_id", user.id);

    const { data: areas } = await supabase
      .from("user_available_areas")
      .select("prefecture")
      .eq("user_id", user.id);

    applyCheck = canApplyJob({
      userRole: (userData?.role as "contractor" | "client" | "staff") ?? "contractor",
      isPaidUser: false,
      jobTradeType: job.trade_type ?? "",
      jobPrefecture: job.prefecture ?? "",
      userSkills: (skills ?? []).map((s) => ({ tradeType: s.trade_type })),
      userAvailableAreas: (areas ?? []).map((a) => ({
        prefecture: a.prefecture,
      })),
    });
  }

  // Check if already applied
  const { data: existingApp } = await supabase
    .from("applications")
    .select("id")
    .eq("job_id", id)
    .eq("applicant_id", user.id)
    .neq("status", "cancelled")
    .maybeSingle();

  const hasApplied = !!existingApp;

  return (
    <div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-secondary">募集案件詳細</h1>

      {/* Title + Company */}
      <h2 className="mt-4 text-heading-md font-bold text-foreground">
        {job.title}
      </h2>
      {ownerCompanyName && (
        <p className="mt-1 text-body-sm text-muted-foreground">
          {ownerCompanyName}
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-3">
        <FavoriteButton
          targetType="job"
          targetId={id}
          initialIsFavorited={!!favorite}
          showLabel
        />
        <div className="flex-1" />
        {hasApplied ? (
          <Button
            disabled
            className="rounded-[47px] bg-muted text-muted-foreground"
          >
            応募済み
          </Button>
        ) : applyCheck.canApply ? (
          <Button
            asChild
            className="rounded-[47px] bg-primary text-primary-foreground"
          >
            <Link href={`/jobs/${id}/apply`}>応募する</Link>
          </Button>
        ) : (
          <Button
            disabled
            className="rounded-[47px] bg-muted text-muted-foreground"
          >
            応募する
          </Button>
        )}
      </div>

      {/* Restriction message */}
      {!applyCheck.canApply && !hasApplied && (
        <p className="mt-2 text-body-sm text-destructive">{applyCheck.reason}</p>
      )}

      {/* Urgent badge */}
      {job.is_urgent && (
        <div className="mt-3">
          <Badge className="rounded-[33px] bg-destructive text-destructive-foreground">
            急募
          </Badge>
        </div>
      )}

      {/* Detail rows */}
      <div className="mt-4">
        <DetailRow
          label="報酬"
          value={
            job.reward_lower && job.reward_upper
              ? `${job.reward_lower.toLocaleString()}〜${job.reward_upper.toLocaleString()}円（人工）`
              : null
          }
        />
        <DetailRow label="エリア" value={job.prefecture} />
        <DetailRow label="募集職種" value={job.trade_type} />
        <DetailRow
          label="募集人数"
          value={job.headcount ? `${job.headcount}人` : null}
        />
        <DetailRow label="勤務地" value={job.location ?? job.address} />
        <DetailRow
          label="現場工期"
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

      {/* Description */}
      {job.description && (
        <section className="mt-4">
          <p className="text-body-md text-foreground whitespace-pre-wrap">
            {job.description}
          </p>
        </section>
      )}

      {/* Images */}
      {images && images.length > 0 && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">添付画像</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {images.map((img) => (
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

      {/* Owner info link */}
      {job.owner_id && (
        <section className="mt-6">
          <Link
            href={`/clients/${job.owner_id}`}
            className="flex items-center justify-between rounded-[8px] border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <span className="text-body-md font-medium text-foreground">
              発注者情報
            </span>
            <span className="text-body-sm font-medium text-primary">
              詳細を見る →
            </span>
          </Link>
        </section>
      )}

      {/* Bottom fixed apply button */}
      <div className="sticky bottom-0 bg-background py-4 mt-6 border-t border-border">
        {hasApplied ? (
          <Button
            disabled
            className="w-full rounded-[47px] bg-muted text-muted-foreground"
          >
            応募済み
          </Button>
        ) : applyCheck.canApply ? (
          <Button
            asChild
            className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href={`/jobs/${id}/apply`}>応募する</Link>
          </Button>
        ) : (
          <Button
            disabled
            className="w-full rounded-[47px] bg-muted text-muted-foreground"
          >
            応募する
          </Button>
        )}
      </div>

      <BackButton />
    </div>
  );
}
