import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveParticipantName } from "@/lib/utils/display-name";
import { getActiveCorporateOrgNames } from "@/lib/utils/resolve-org-names";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApplicationStatusBadge,
} from "@/components/shared/application-status-badge";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "./back-button";
import { StatusFilter } from "./status-filter";
import { SortButton } from "./sort-button";
import { SuccessToast } from "./success-toast";
import { formatDate } from "@/lib/utils/format-date";

const ITEMS_PER_PAGE = 20;

interface Props {
  searchParams: Promise<{ page?: string; filter?: string; sort?: string }>;
}

export default async function ApplicationHistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const currentPage = Number(params.page) || 1;
  const from = (currentPage - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;
  const filterCategory = params.filter || "";
  const sortOrder = params.sort === "asc" ? true : false;

  // Fetch all applications with job + review info
  // We need client_reviews to determine display category
  let query = supabase
    .from("applications")
    .select(
      `id, status, created_at, applicant_id, scout_message_id,
       jobs(id, title, owner_id, trade_type, headcount, reward_lower, reward_upper,
            recruit_start_date, recruit_end_date, prefecture,
            owner:users!jobs_owner_id_fkey(company_name, last_name, first_name, deleted_at)),
       client_reviews(id),
       user_reviews(id)`,
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: sortOrder });

  // Apply DB-level status filter based on display category
  if (filterCategory === "応募結果待ち") {
    query = query.eq("status", "applied");
  } else if (filterCategory === "稼働予定" || filterCategory === "評価登録済み" || filterCategory === "評価登録未入力") {
    query = query.eq("status", "accepted");
  } else if (filterCategory === "落選・キャンセル") {
    query = query.in("status", ["rejected", "cancelled"]);
  } else if (filterCategory === "取引完了") {
    query = query.in("status", ["completed", "lost"]);
  }

  const { data: allApplications } = await query;

  // Post-filter for accepted sub-statuses (needs both reviews check)
  let filteredApplications = allApplications ?? [];
  if (filterCategory === "稼働予定") {
    filteredApplications = filteredApplications.filter(
      (app) => {
        const hasCR = app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
        const hasUR = app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
        return !hasCR && !hasUR;
      },
    );
  } else if (filterCategory === "評価登録済み") {
    filteredApplications = filteredApplications.filter(
      (app) => {
        const hasCR = app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
        const hasUR = app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
        return hasCR && !hasUR;
      },
    );
  } else if (filterCategory === "評価登録未入力") {
    filteredApplications = filteredApplications.filter(
      (app) => {
        const hasCR = app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
        const hasUR = app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
        return !hasCR && hasUR;
      },
    );
  }

  const totalCount = filteredApplications.length;

  // Manual pagination
  const paginatedApplications = filteredApplications.slice(from, to + 1);

  // 法人プラン active のオーナーだけ組織名を使う（ダウングレード後は company_name に戻す）
  const ownerIds = Array.from(
    new Set(
      paginatedApplications
        .map((a) => (a.jobs as unknown as { owner_id?: string } | null)?.owner_id)
        .filter((v): v is string => !!v),
    ),
  );
  const admin = createAdminClient();
  const orgNameByOwnerId = await getActiveCorporateOrgNames(admin, ownerIds);

  return (
    <div className="min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">応募履歴</h1>

      {/* Success toast (from CON-013 etc.) */}
      <Suspense fallback={null}>
        <SuccessToast />
      </Suspense>

      {/* Status filter */}
      <Suspense fallback={null}>
        <StatusFilter currentSort={params.sort} />
      </Suspense>

      {/* Search result count + sort */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          検索結果: {totalCount}件
        </p>
        <Suspense fallback={null}>
          <SortButton />
        </Suspense>
      </div>

      {paginatedApplications.length === 0 && (
        <p className="mt-8 text-center text-body-md text-muted-foreground">
          応募履歴はありません
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {paginatedApplications.map((app) => {
          const job = app.jobs as {
            id: string;
            title: string;
            owner_id: string;
            trade_type: string | null;
            headcount: number | null;
            reward_lower: number | null;
            reward_upper: number | null;
            recruit_start_date: string | null;
            recruit_end_date: string | null;
            prefecture: string | null;
            owner: {
              company_name: string | null;
              last_name: string | null;
              first_name: string | null;
              deleted_at: string | null;
            } | null;
          } | null;

          const hasClientReview =
            app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
          const hasUserReview =
            app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);

          const companyName = job?.owner
            ? resolveParticipantName({
                organizationName: job.owner_id
                  ? (orgNameByOwnerId.get(job.owner_id) ?? null)
                  : null,
                companyName: job.owner.company_name,
                lastName: job.owner.last_name,
                firstName: job.owner.first_name,
                deletedAt: job.owner.deleted_at,
              })
            : "不明";

          const rewardText =
            job?.reward_lower
              ? `${job.reward_lower.toLocaleString()}円（人工）`
              : "未定";

          const recruitPeriod =
            job?.recruit_start_date && job?.recruit_end_date
              ? `${formatDate(job.recruit_start_date)}〜${formatDate(job.recruit_end_date)}`
              : "";

          return (
            <Card key={app.id} className="overflow-hidden rounded-[8px]">
              {/* 1. Status badge — flush to top-left */}
              <div className="flex items-center gap-2 px-2 pt-2">
                <ApplicationStatusBadge
                  status={app.status}
                  hasClientReview={hasClientReview}
                  hasUserReview={hasUserReview}
                />
                {app.scout_message_id && (
                  <span className="rounded-full bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-xs text-primary/70">
                    スカウト経由
                  </span>
                )}
              </div>

              <CardContent className="px-4 pb-4 pt-2">
                {/* 2. Title */}
                <p className="text-body-lg font-semibold text-foreground">
                  {job?.title ?? "不明な案件"}
                </p>

                {/* 3. Company name */}
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {companyName}
                </p>

                {/* 4. Trade type + headcount */}
                <p className="mt-2 text-body-sm text-foreground">
                  {job?.trade_type ?? ""}
                  {job?.headcount ? `・${job.headcount}人` : ""}
                </p>

                {/* 5. Reward, Area, Recruit period with icons + labels */}
                <div className="mt-2 space-y-2 text-body-sm text-foreground">
                  <div className="flex items-center">
                    <img src="/images/icons/icon-coin.png" alt="" className="size-4" />
                    <span className="ml-2 w-16 shrink-0 font-semibold">報酬</span>
                    <span>{rewardText}</span>
                  </div>
                  {job?.prefecture && (
                    <div className="flex items-center">
                      <img src="/images/icons/icon-pin.png" alt="" className="size-4" />
                      <span className="ml-2 w-16 shrink-0 font-semibold">エリア</span>
                      <span>{job.prefecture}</span>
                    </div>
                  )}
                  {recruitPeriod && (
                    <div className="flex items-center">
                      <img src="/images/icons/icon-calendar.png" alt="" className="size-4" />
                      <span className="ml-2 w-16 shrink-0 font-semibold">募集期間</span>
                      <span>{recruitPeriod}</span>
                    </div>
                  )}
                </div>

                {/* Pill buttons */}
                <div className="mt-4 flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-pill border-primary text-body-xs text-primary"
                    asChild
                  >
                    <Link href="/messages">メッセージを確認</Link>
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-pill text-body-xs text-white"
                    asChild
                  >
                    <Link href={`/applications/history/${app.id}`}>
                      応募詳細を見る
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalCount > ITEMS_PER_PAGE && (
        <PaginationControls totalCount={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
      )}

      <div className="mt-6">
        <BackButton className="w-full" />
      </div>
    </div>
  );
}
