import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { resolveEffectiveSubscription } from "@/lib/billing/resolve-effective-subscription";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { canApplyJob } from "@/lib/matching";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { BackButton } from "@/components/job-search/back-button";
import { BackButton as SharedBackButton } from "@/components/shared/back-button";
import { ZoomableImage } from "@/components/job-search/zoomable-image";
import { AreaList } from "@/components/area/area-list";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { formatDate } from "@/lib/utils/format-date";
import { formatRewardRange } from "@/lib/utils/format-reward";
import { CloseJobButton } from "./close-job-button";

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

function DetailRow({
  label,
  value,
  alwaysShow = false,
  note,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
  alwaysShow?: boolean;
  /** ラベル下に表示する補足説明（何を表す項目かの注記） */
  note?: string;
}) {
  const isString = typeof value === "string";
  const isEmpty = value == null || (isString && !value);
  if (isEmpty && !alwaysShow) return null;
  return (
    <div className="flex border-b border-border py-3">
      <span className="w-32 shrink-0 text-body-md font-medium text-secondary">
        {label}
      </span>
      <div className="flex-1">
        {isEmpty ? (
          <span className="text-body-md text-foreground">—</span>
        ) : isString ? (
          <span className="text-body-md text-foreground">{value}</span>
        ) : (
          <div className="text-body-md text-foreground">{value}</div>
        )}
        {note && (
          <p className="mt-0.5 text-body-xs text-muted-foreground">{note}</p>
        )}
      </div>
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

  // Fetch job with owner info（standard query pattern + organization.owner_user で
  // Staff 作成案件でも社長の client_profiles に到達する / B3 対応）
  const { data: job } = await supabase
    .from("jobs")
    .select(`
      *,
      owner:users!owner_id(
        last_name, first_name, deleted_at,
        client_profiles(display_name, image_url)
      ),
      organization:organizations(
        owner_user:users!owner_id(
          last_name, first_name, deleted_at,
          client_profiles(display_name, image_url)
        )
      )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) {
    // RLS で読めない = (a) 無関係ユーザーが開いた掲載終了案件 /
    // (b) 削除済み / (c) 存在しない。(a) のときだけ「掲載終了しました」と
    // 案内する（案件の中身は出さない = 非公開のまま）。それ以外は 404。
    const admin = createAdminClient();
    const { data: probe } = await admin
      .from("jobs")
      .select("status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (probe && probe.status === "closed" && !probe.deleted_at) {
      return (
        <div className="min-h-dvh">
          <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
            <h1 className="text-center text-heading-lg font-bold text-secondary">
              募集案件詳細
            </h1>
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <StatusBadge status="closed" />
              <p className="text-body-md text-foreground">
                この案件は掲載終了しました。
              </p>
              <p className="text-body-sm text-muted-foreground">
                現在は募集していないため、詳細は表示できません。
              </p>
              <div className="mt-4">
                <SharedBackButton />
              </div>
            </div>
          </div>
        </div>
      );
    }
    notFound();
  }

  // Fetch images
  const { data: images } = await supabase
    .from("job_images")
    .select("*")
    .eq("job_id", id)
    .order("sort_order", { ascending: true });

  // master-area: fetch job_areas for display
  const { data: jobAreaRowsForDisplay } = await supabase
    .from("job_areas")
    .select("prefecture, municipality")
    .eq("job_id", id);
  const jobAreas: AreaForDisplay[] = (jobAreaRowsForDisplay ?? []).map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));

  const isOwner = job.owner_id === user.id;
  // 掲載終了案件（関係者のみここに到達）は読み取り専用にする
  const isClosed = job.status === "closed";

  // 組織コンテキストを 1 回だけ解決し、下流の (1) 同組織メンバー判定と
  // (2) 実効サブスク解決の両方で使い回す。Owner でも Staff/Admin でも同じ。
  const { active } = await getActiveOrganizationContext(supabase);

  // Check if user belongs to the same organization as the job
  const isOrganizationMember =
    !isOwner &&
    !!job.organization_id &&
    active?.organizationId === job.organization_id;

  const canManage = isOwner || isOrganizationMember;

  const ownerResolution = resolveClientProfileForRow(job);
  const ownerCompanyName = resolveParticipantName({
    displayName: ownerResolution.displayName,
    lastName: ownerResolution.lastName,
    firstName: ownerResolution.firstName,
    deletedAt: ownerResolution.deletedAt,
  });

  // --- Owner/Organization view (CLI-002) --- only when accessed via ?manage=true from CLI-001
  if (canManage && isManageView) {
    const { count: applicationCount } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("job_id", id);

    // 発注確定済み（稼働予定/稼働中）の受注者数。掲載終了時の注意喚起を
    // 出すかどうかの判定に使う（0 件なら従来のシンプルな確認のみ）
    const { count: acceptedApplicationCount } = await supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("job_id", id)
      .eq("status", "accepted");

    const { data: urgentOption } = await supabase
      .from("option_subscriptions")
      .select("id")
      .eq("job_id", id)
      .eq("option_type", "urgent")
      .eq("status", "active")
      .maybeSingle();

    return (
      <div className="min-h-dvh">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
        {/* Header */}
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          募集現場詳細
        </h1>
        {job.status === "open" && (
          <div className="mt-3 flex justify-center">
            <CloseJobButton jobId={id} acceptedCount={acceptedApplicationCount ?? 0} />
          </div>
        )}

        {/* Status badge */}
        <div className="mt-2">
          <StatusBadge status={job.status} />
          {urgentOption && (
            <Badge className="ml-2 rounded-sm bg-destructive text-destructive-foreground">
              急募
            </Badge>
          )}
        </div>

        {/* Hero image (1枚目 / 枠固定で全体表示) */}
        {images && images.length > 0 ? (
          <div className="mt-4">
            <ZoomableImage
              src={images[0].image_url}
              alt="案件画像"
              fit="contain"
              frameClassName="aspect-[16/9] w-full rounded-lg border border-border bg-muted"
            />
          </div>
        ) : (
          <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30">
            <span className="text-muted-foreground">画像なし</span>
          </div>
        )}

        {/* Title + Company */}
        <h2 className="mt-4 text-heading-md font-bold text-foreground">
          {job.title}
        </h2>
        {ownerCompanyName && (
          <p className="mt-1 text-body-sm text-muted-foreground">
            {ownerCompanyName}
          </p>
        )}

        {/* 案件詳細 */}
        {job.description && (
          <p className="mt-3 text-body-md text-foreground whitespace-pre-wrap">
            {job.description}
          </p>
        )}

        {/* Action buttons (upper) */}
        <div className="mt-4 flex justify-center gap-3">
          <Button
            variant="outline"
            className="w-40 rounded-[47px] border-secondary text-secondary"
            asChild
          >
            <Link href={`/jobs/${id}/applicants`}>
              応募者をみる{applicationCount ? `（${applicationCount}件）` : ""}
            </Link>
          </Button>
          <Button
            className="w-40 rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            asChild
          >
            <Link href={`/jobs/${id}/edit`}>編集する</Link>
          </Button>
        </div>

        {/* 条件 section */}
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">条件</h3>
          <div className="mt-2">
            <DetailRow
              label="報酬"
              value={formatRewardRange(job.reward_lower, job.reward_upper)}
              alwaysShow
            />
            <DetailRow
              label="エリア"
              value={<AreaList areas={jobAreas} />}
              alwaysShow
            />
            <DetailRow
              label="募集職種"
              value={
                job.trade_types.length > 0 ? (
                  <CollapsibleList items={job.trade_types} initialLimit={5} />
                ) : null
              }
              alwaysShow
            />
            <DetailRow
              label="募集人数"
              value={job.headcount ? `${job.headcount}人` : null}
              alwaysShow
            />
            <DetailRow
              label="工事全体の工期"
              value={
                job.project_start_date || job.project_end_date
                  ? `${job.project_start_date ? formatDate(job.project_start_date) : "—"}〜${job.project_end_date ? formatDate(job.project_end_date) : "—"}`
                  : null
              }
              alwaysShow
            />
            <DetailRow
              label="稼働期間"
              value={
                job.work_start_date || job.work_end_date
                  ? `${job.work_start_date ? formatDate(job.work_start_date) : "—"}〜${job.work_end_date ? formatDate(job.work_end_date) : "—"}`
                  : null
              }
              alwaysShow
            />
            <DetailRow
              label="応募受付期間"
              value={
                job.recruit_start_date || job.recruit_end_date
                  ? `${job.recruit_start_date ? formatDate(job.recruit_start_date) : "—"}〜${job.recruit_end_date ? formatDate(job.recruit_end_date) : "—"}`
                  : null
              }
              alwaysShow
            />
            <DetailRow label="稼働時間" value={job.work_hours} alwaysShow />
            <DetailRow
              label="応募締め切り"
              value={job.recruit_end_date ? formatDate(job.recruit_end_date) : null}
              alwaysShow
            />
            <DetailRow label="経験年数" value={job.experience_years} alwaysShow />
            <DetailRow label="必須スキル" value={job.required_skills} alwaysShow />
            <DetailRow label="言語" value={(job.language ?? []).join("、") || null} alwaysShow />
            <DetailRow label="持ち物" value={job.items} alwaysShow />
          </div>
        </section>

        {/* 業務内容 section */}
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">業務内容</h3>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-body-md font-medium text-secondary">スケジュール詳細</p>
              <p className="mt-1 pl-4 text-body-md text-foreground whitespace-pre-wrap">
                {job.schedule_detail || "—"}
              </p>
            </div>
            <div>
              <p className="text-body-md font-medium text-secondary">請負案件詳細</p>
              <p className="mt-1 pl-4 text-body-md text-foreground whitespace-pre-wrap">
                {job.project_details || "—"}
              </p>
            </div>
          </div>
        </section>

        {/* 発注者からのメッセージ section */}
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">
            発注者からのメッセージ
          </h3>
          <div className="mt-2 rounded-[8px] border border-border p-4">
            <p className="text-body-md text-foreground whitespace-pre-wrap">
              {job.owner_message || "—"}
            </p>
          </div>
        </section>

        {/* Images (2枚目以降。1枚目はヒーローに表示済み) */}
        {images && images.length > 1 && (
          <section className="mt-6">
            <h3 className="text-body-lg font-bold text-foreground">添付画像</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              {images.slice(1).map((img) => (
                <ZoomableImage
                  key={img.id}
                  src={img.image_url}
                  alt="案件画像"
                  fit="cover"
                  frameClassName="aspect-square w-full rounded-lg bg-muted"
                />
              ))}
            </div>
          </section>
        )}

        {/* Action buttons (lower) */}
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="outline"
            className="w-40 rounded-[47px] border-secondary text-secondary"
            asChild
          >
            <Link href={`/jobs/${id}/applicants`}>
              応募者をみる{applicationCount ? `（${applicationCount}件）` : ""}
            </Link>
          </Button>
          <Button
            className="w-40 rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            asChild
          >
            <Link href={`/jobs/${id}/edit`}>編集する</Link>
          </Button>
        </div>

        {/* Copy & Back buttons */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button
            className="w-full max-w-xs rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            asChild
          >
            <Link href={`/jobs/create?copyFrom=${id}`}>
              コピーして新規作成する
            </Link>
          </Button>
          <SharedBackButton href="/jobs/manage" />
        </div>
        </div>
      </div>
    );
  }

  // --- Applicant view (CON-003) ---

  // Hide apply button for: own jobs, same org jobs, staff (staff cannot apply per
  // roles-and-permissions.md), and 掲載終了案件（応募不可）
  const hideApplyButton = canManage || userData?.role === "staff" || isClosed;

  // Check favorite status
  const { data: favorite } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", "job")
    .eq("target_id", id)
    .maybeSingle();

  // Check application eligibility
  // Staff / Admin (org_role) は Owner のサブスクに相乗りするため
  // resolveEffectiveSubscription 経由で解決する。
  // 従来は `role === "staff"` を isPaidUser に直接混ぜて補正していたが、
  // ヘルパー化により Owner のサブスクを実データで引けるようになったため撤去
  // （CLAUDE.md「isPaidUser の判定に role === 'staff' を含めてはならない」）。
  const subscription = await resolveEffectiveSubscription(
    supabase,
    user.id,
    active,
  );

  const isPaidUser = !!subscription || userData?.role === "client";

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
    const jobPrefectures = Array.from(
      new Set(jobAreas.map((a) => a.prefecture)),
    );

    applyCheck = canApplyJob({
      userRole: (userData?.role as "contractor" | "client" | "staff") ?? "contractor",
      isPaidUser: false,
      jobTradeTypes: job.trade_types,
      jobPrefectures,
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
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">募集案件詳細</h1>

      {/* 掲載終了バナー（読み取り専用・応募不可を明示） */}
      {isClosed && (
        <div className="mt-3 flex flex-col items-center gap-1">
          <StatusBadge status="closed" />
          <p className="text-body-sm text-muted-foreground">
            この案件の募集は終了しました。
          </p>
        </div>
      )}

      {/* Hero image (1枚目 / タイトル直下・枠固定で全体表示) */}
      {images && images.length > 0 && (
        <div className="mt-4">
          <ZoomableImage
            src={images[0].image_url}
            alt="案件画像"
            fit="contain"
            frameClassName="aspect-[16/9] w-full rounded-lg border border-border bg-muted"
          />
        </div>
      )}

      {/* Title + Company */}
      <h2 className="mt-4 text-heading-md font-bold text-foreground">
        {job.title}
      </h2>
      {ownerCompanyName && (
        <p className="mt-1 text-body-sm text-muted-foreground">
          {ownerCompanyName}
        </p>
      )}

      {/* 案件詳細 */}
      {job.description && (
        <p className="mt-3 text-body-md text-foreground whitespace-pre-wrap">
          {job.description}
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
        {!hideApplyButton && (
          hasApplied ? (
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
          )
        )}
      </div>

      {/* Restriction message */}
      {!hideApplyButton && !applyCheck.canApply && !hasApplied && (
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

      {/* 条件 */}
      <section className="mt-6">
        <h3 className="text-body-lg font-bold text-foreground">条件</h3>
        <div className="mt-2">
          <DetailRow
            label="報酬"
            value={formatRewardRange(job.reward_lower, job.reward_upper)}
            alwaysShow
          />
          <DetailRow
            label="エリア"
            value={<AreaList areas={jobAreas} />}
            alwaysShow
          />
          <DetailRow
            label="募集職種"
            value={
              job.trade_types.length > 0 ? (
                <CollapsibleList items={job.trade_types} initialLimit={5} />
              ) : null
            }
            alwaysShow
          />
          <DetailRow
            label="募集人数"
            value={job.headcount ? `${job.headcount}人` : null}
            alwaysShow
          />
          {/* 工事全体の工期は任意入力のため、未入力の案件では行ごと非表示 */}
          <DetailRow
            label="工事全体の工期"
            value={
              job.project_start_date && job.project_end_date
                ? `${formatDate(job.project_start_date)}〜${formatDate(job.project_end_date)}`
                : null
            }
            note="工事プロジェクト全体の期間"
          />
          <DetailRow
            label="稼働期間"
            value={
              job.work_start_date && job.work_end_date
                ? `${formatDate(job.work_start_date)}〜${formatDate(job.work_end_date)}`
                : null
            }
            note="実際に働いていただく期間"
            alwaysShow
          />
          <DetailRow label="稼働時間" value={job.work_hours} alwaysShow />
          <DetailRow
            label="応募締め切り"
            value={job.recruit_end_date ? formatDate(job.recruit_end_date) : null}
            alwaysShow
          />
          <DetailRow label="経験年数" value={job.experience_years} alwaysShow />
          <DetailRow label="必須スキル" value={job.required_skills} alwaysShow />
          <DetailRow label="言語" value={(job.language ?? []).join("、") || null} alwaysShow />
          <DetailRow label="持ち物" value={job.items} alwaysShow />
        </div>
      </section>

      {/* 業務内容 */}
      <section className="mt-6">
        <h3 className="text-body-lg font-bold text-foreground">業務内容</h3>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-body-md font-medium text-secondary">スケジュール詳細</p>
            <p className="mt-1 pl-4 text-body-md text-foreground whitespace-pre-wrap">
              {job.schedule_detail || "—"}
            </p>
          </div>
          <div>
            <p className="text-body-md font-medium text-secondary">請負案件詳細</p>
            <p className="mt-1 pl-4 text-body-md text-foreground whitespace-pre-wrap">
              {job.project_details || "—"}
            </p>
          </div>
        </div>
      </section>

      {/* 発注者からのメッセージ */}
      <section className="mt-6">
        <h3 className="text-body-lg font-bold text-foreground">発注者からのメッセージ</h3>
        <div className="mt-2 rounded-[8px] border border-border p-4">
          <p className="text-body-md text-foreground whitespace-pre-wrap">
            {job.owner_message || job.description || "—"}
          </p>
        </div>
      </section>

      {/* Images (2枚目以降。1枚目はヒーローに表示済み) */}
      {images && images.length > 1 && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">添付画像</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {images.slice(1).map((img) => (
              <ZoomableImage
                key={img.id}
                src={img.image_url}
                alt="案件画像"
                fit="cover"
                frameClassName="aspect-square w-full rounded-lg bg-muted"
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
      {!hideApplyButton && (
        <div className="sticky bottom-0 bg-background py-4 mt-6 border-t border-border">
          <div className="mx-auto w-full max-w-xs">
            {hasApplied ? (
              <Button
                disabled
                className="w-full rounded-pill text-body-md border-muted bg-muted text-muted-foreground"
              >
                応募済み
              </Button>
            ) : applyCheck.canApply ? (
              <Button
                asChild
                className="w-full rounded-pill text-body-md border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href={`/jobs/${id}/apply`}>応募する</Link>
              </Button>
            ) : (
              <Button
                disabled
                className="w-full rounded-pill text-body-md border-muted bg-muted text-muted-foreground"
              >
                応募する
              </Button>
            )}
          </div>
        </div>
      )}

      <BackButton />
    </div>
    </div>
  );
}
