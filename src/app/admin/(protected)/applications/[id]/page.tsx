import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AreaList } from "@/components/area/area-list";
import { CollapsibleList } from "@/components/master/collapsible-list";
import {
  ADMIN_APPLICATION_CATEGORY_LABELS,
  canAdminCancel,
  classifyAdminApplication,
} from "@/lib/admin/application-status";
import { RATING_ITEMS } from "@/lib/constants/rating";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { formatDate, getJstToday } from "@/lib/utils/format-date";
import { formatRewardRange } from "@/lib/utils/format-reward";
import { cn } from "@/lib/utils";
import { CancelButton } from "./cancel-button";

interface PageProps {
  params: Promise<{ id: string }>;
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

/** 個別評価の ★×5 表示（集計ではなく1件の評価値。null は「—」） */
function IndividualStars({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-body-sm text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-4 w-4",
            star <= value
              ? "fill-secondary text-secondary"
              : "fill-none text-gray-300",
          )}
        />
      ))}
    </span>
  );
}

const RATING_AGAIN_LABELS: Record<string, string> = {
  good: "はい",
  bad: "いいえ",
};

/**
 * ADM-014: 応募履歴詳細。
 * デザインカンプ: design-assets/screens/ADM-014.png
 * （カンプの発注者評価「はい/いいえ 6項目」は旧仕様のため ★×5 表示に置き換える）
 *
 * - 個別評価（集計ではない）を application_id で両方向1件ずつ表示
 * - 発注取消ボタンは canAdminCancel が true の場合のみ（Server Action 内でも再評価）
 */
export default async function AdminApplicationDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();
  const today = getJstToday();

  const { data: app } = await admin
    .from("applications")
    .select(
      `id, status, first_work_date, cancelled_by, work_location, job_id, applicant_id,
       job:jobs(id, title, trade_types, headcount, recruit_start_date, recruit_end_date,
                reward_lower, reward_upper),
       applicant:users!applicant_id(last_name, first_name, email, birth_date, deleted_at)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!app) notFound();

  const [{ data: jobAreaRows }, { data: contractorReview }, { data: clientReview }] =
    await Promise.all([
      admin
        .from("job_areas")
        .select("prefecture, municipality")
        .eq("job_id", app.job_id),
      // ユーザー評価（受注者→発注者）
      admin
        .from("client_reviews")
        .select("operating_status, status_supplement, rating_again, comment")
        .eq("application_id", id)
        .maybeSingle(),
      // 発注者評価（発注者→受注者）
      admin
        .from("user_reviews")
        .select(
          "operating_status, status_supplement, comment, rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment",
        )
        .eq("application_id", id)
        .maybeSingle(),
    ]);

  const jobAreas: AreaForDisplay[] = (jobAreaRows ?? []).map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));

  const name = getUserDisplayName({
    lastName: app.applicant?.last_name,
    firstName: app.applicant?.first_name,
    deletedAt: app.applicant?.deleted_at,
  });
  const age = app.applicant?.birth_date
    ? calculateAge(app.applicant.birth_date)
    : null;

  const category = classifyAdminApplication(
    {
      status: app.status,
      first_work_date: app.first_work_date,
      cancelled_by: app.cancelled_by as "contractor" | "admin" | null,
    },
    today,
  );
  const showCancelButton = canAdminCancel(app, today);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        応募履歴詳細
      </h1>

      {/* ステータスバッジ（8分類表記・ADM-013 の行バッジと同スタイル）＋発注取消 */}
      <div className="mt-4 flex items-center gap-3">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-body-sm font-medium text-primary">
          {ADMIN_APPLICATION_CATEGORY_LABELS[category]}
        </span>
        {showCancelButton && <CancelButton applicationId={id} />}
      </div>

      {/* 案件情報 → ADM-022 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">案件情報</h2>
        <Link
          href={`/admin/jobs/${app.job_id}`}
          className="mt-2 block rounded-[8px] border border-border/20 bg-background p-4 transition-colors hover:bg-muted/50"
        >
          <p className="text-body-md font-bold text-foreground">
            {app.job?.title ?? "—"}
          </p>
          <div className="mt-2 space-y-1 text-body-sm text-foreground">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-muted-foreground">
                募集職種・人数：
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {(app.job?.trade_types ?? []).length > 0 ? (
                  <CollapsibleList
                    items={app.job!.trade_types}
                    initialLimit={3}
                  />
                ) : (
                  "—"
                )}
                {app.job?.headcount ? (
                  <span className="shrink-0">{app.job.headcount}人</span>
                ) : null}
              </span>
            </div>
            <p>
              <span className="text-muted-foreground">締め切り：</span>
              {formatDate(app.job?.recruit_end_date)}
            </p>
            <p>
              <span className="text-muted-foreground">募集期間：</span>
              {app.job?.recruit_start_date || app.job?.recruit_end_date
                ? `${formatDate(app.job?.recruit_start_date)}〜${formatDate(app.job?.recruit_end_date)}`
                : "—"}
            </p>
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-muted-foreground">勤務地：</span>
              <span>
                {jobAreas.length > 0 ? <AreaList areas={jobAreas} /> : "—"}
                {app.work_location && (
                  <span className="mt-1 block">{app.work_location}</span>
                )}
              </span>
            </div>
            <p>
              <span className="text-muted-foreground">工事代金：</span>
              {formatRewardRange(app.job?.reward_lower, app.job?.reward_upper) ??
                "—"}
            </p>
          </div>
        </Link>
      </section>

      {/* ユーザー情報 → ADM-009 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">ユーザー情報</h2>
        <Link
          href={`/admin/users/${app.applicant_id}`}
          className="mt-2 block rounded-[8px] border border-border/20 bg-background p-4 transition-colors hover:bg-muted/50"
        >
          <p className="text-body-md font-medium text-foreground">
            {name}
            {age !== null && <span>（{age}歳）</span>}
          </p>
          <p className="truncate text-body-sm text-muted-foreground">
            {app.applicant?.email}
          </p>
        </Link>
      </section>

      {/* 初回勤務日 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">初回勤務日</h2>
        <p className="mt-2 pl-4 text-body-md text-foreground">
          {formatDate(app.first_work_date)}
        </p>
      </section>

      {/* ユーザー評価（受注者→発注者） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">ユーザー評価</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          {!contractorReview ? (
            <p className="px-4 py-4 text-body-sm text-muted-foreground">
              未評価
            </p>
          ) : (
            <>
              <DetailRow
                label="稼働状況"
                value={contractorReview.operating_status}
              />
              <DetailRow
                label="稼働状況の補足"
                value={
                  contractorReview.status_supplement ? (
                    <span className="whitespace-pre-wrap">
                      {contractorReview.status_supplement}
                    </span>
                  ) : null
                }
              />
              <DetailRow
                label="評価"
                value={
                  <div className="flex items-center justify-between gap-3">
                    <span>また仕事を受けたいか</span>
                    <span className="font-bold">
                      {RATING_AGAIN_LABELS[contractorReview.rating_again ?? ""] ??
                        "—"}
                    </span>
                  </div>
                }
              />
              <DetailRow
                label="評価の補足"
                value={
                  contractorReview.comment ? (
                    <span className="whitespace-pre-wrap">
                      {contractorReview.comment}
                    </span>
                  ) : null
                }
              />
            </>
          )}
        </div>
      </section>

      {/* 発注者評価（発注者→受注者・★×5 7項目） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">発注者評価</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          {!clientReview ? (
            <p className="px-4 py-4 text-body-sm text-muted-foreground">
              未評価
            </p>
          ) : (
            <>
              <DetailRow
                label="稼働状況"
                value={clientReview.operating_status}
              />
              <DetailRow
                label="稼働状況の補足"
                value={
                  clientReview.status_supplement ? (
                    <span className="whitespace-pre-wrap">
                      {clientReview.status_supplement}
                    </span>
                  ) : null
                }
              />
              <DetailRow
                label="評価"
                value={
                  <div className="space-y-2">
                    {RATING_ITEMS.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-body-sm">{item.label}</span>
                        <IndividualStars value={clientReview[item.key]} />
                      </div>
                    ))}
                  </div>
                }
              />
              <DetailRow
                label="評価の補足"
                value={
                  clientReview.comment ? (
                    <span className="whitespace-pre-wrap">
                      {clientReview.comment}
                    </span>
                  ) : null
                }
              />
            </>
          )}
        </div>
      </section>

      {/* もどる */}
      <div className="mt-10 flex flex-col items-center">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/applications">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
