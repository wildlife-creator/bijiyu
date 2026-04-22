import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApplicationStatusBadge,
  getOrderDisplayCategory,
} from "@/components/shared/application-status-badge";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/shared/back-button";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { calculateAge } from "@/lib/utils/calculate-age";
import { formatDate } from "@/lib/utils/format-date";
import { StatusFilter } from "./status-filter";
import { SortButton } from "./sort-button";

const ITEMS_PER_PAGE = 20;

interface Props {
  searchParams: Promise<{ page?: string; status?: string; sort?: string }>;
}

export default async function OrderHistoryPage({ searchParams }: Props) {
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
  const filterCategory = params.status || "";
  const sortOrder = params.sort === "asc" ? true : false;

  // Build query — fetch ordered applications with applicant details
  let query = supabase
    .from("applications")
    .select(
      `id, status, created_at, updated_at, scout_message_id,
       applicant:users!applications_applicant_id_fkey(
         id, last_name, first_name, avatar_url, birth_date,
         identity_verified, ccus_verified, deleted_at,
         user_skills(trade_type, experience_years),
         user_available_areas(prefecture)
       ),
       jobs!inner(id, title, owner_id, trade_type, headcount, recruit_end_date),
       user_reviews(id),
       client_reviews(id)`,
    )
    .eq("jobs.owner_id", user.id)
    .order("updated_at", { ascending: sortOrder });

  // Apply DB-level status filter
  if (filterCategory === "応募あり（未対応）") {
    query = query.eq("status", "applied");
  } else if (filterCategory === "発注済み" || filterCategory === "評価登録済み" || filterCategory === "評価登録未入力") {
    query = query.eq("status", "accepted");
  } else if (filterCategory === "キャンセル・お断り") {
    query = query.in("status", ["cancelled", "rejected"]);
  } else if (filterCategory === "取引完了") {
    query = query.in("status", ["completed", "lost"]);
  } else {
    // No filter — show all statuses
    query = query.in("status", ["applied", "accepted", "completed", "lost", "cancelled", "rejected"]);
  }

  const { data: allApplications } = await query;

  // Post-filter for accepted sub-statuses (needs both reviews check)
  let filteredApplications = allApplications ?? [];
  if (filterCategory === "発注済み") {
    filteredApplications = filteredApplications.filter(
      (app) => {
        const hasUR = app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
        const hasCR = app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
        return !hasUR && !hasCR;
      },
    );
  } else if (filterCategory === "評価登録済み") {
    filteredApplications = filteredApplications.filter(
      (app) => {
        const hasUR = app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
        const hasCR = app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
        return hasUR && !hasCR;
      },
    );
  } else if (filterCategory === "評価登録未入力") {
    filteredApplications = filteredApplications.filter(
      (app) => {
        const hasUR = app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
        const hasCR = app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);
        return !hasUR && hasCR;
      },
    );
  }

  const totalCount = filteredApplications.length;

  // Manual pagination
  const paginatedApplications = filteredApplications.slice(from, to + 1);

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注履歴一覧
      </h1>

      {/* Status filter */}
      <Suspense fallback={null}>
        <StatusFilter />
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
          発注履歴はありません
        </p>
      )}

      <div className="mt-4 space-y-4">
        {paginatedApplications.map((app) => {
          const applicant = app.applicant as {
            id: string;
            last_name: string | null;
            first_name: string | null;
            avatar_url: string | null;
            birth_date: string | null;
            identity_verified: boolean | null;
            ccus_verified: boolean | null;
            deleted_at: string | null;
            user_skills: { trade_type: string; experience_years: number | null }[] | null;
            user_available_areas: { prefecture: string }[] | null;
          } | null;

          const job = app.jobs as {
            id: string;
            title: string;
            owner_id: string;
            trade_type: string | null;
            headcount: number | null;
            recruit_end_date: string | null;
          } | null;

          const hasUserReview =
            app.user_reviews != null && (!Array.isArray(app.user_reviews) || app.user_reviews.length > 0);
          const hasClientReview =
            app.client_reviews != null && (!Array.isArray(app.client_reviews) || app.client_reviews.length > 0);

          const displayCategory = getOrderDisplayCategory(app.status, hasUserReview, hasClientReview);

          const contractorName = applicant
            ? getUserDisplayName({
                lastName: applicant.last_name,
                firstName: applicant.first_name,
                deletedAt: applicant.deleted_at,
              })
            : "不明";

          const age = applicant?.birth_date
            ? calculateAge(applicant.birth_date)
            : null;

          const skills = applicant?.user_skills?.map((s) => s.trade_type) ?? [];
          const maxExperience = applicant?.user_skills?.reduce(
            (max, s) => Math.max(max, s.experience_years ?? 0),
            0,
          ) ?? 0;
          const areas =
            applicant?.user_available_areas?.map((a) => a.prefecture) ?? [];

          return (
            <Card key={app.id} className="overflow-hidden rounded-[8px]">
              {/* 1. Status badge */}
              <div className="flex items-center gap-2 px-4 pt-3">
                <ApplicationStatusBadge
                  status={app.status}
                  displayCategory={displayCategory}
                />
                {app.scout_message_id && (
                  <span className="rounded-full bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-xs text-primary/70">
                    スカウト経由
                  </span>
                )}
              </div>

              <CardContent className="px-4 pb-4 pt-2">
                {/* 2. Contractor info */}
                <div className="flex items-start gap-3">
                  <div className="size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                    {applicant?.avatar_url ? (
                      <img
                        src={applicant.avatar_url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <img
                          src="/images/icons/icon-avatar.png"
                          alt=""
                          className="size-5 opacity-50"
                        />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-md font-semibold text-foreground">
                      {contractorName}
                      {age !== null && (
                        <span className="ml-1 text-body-sm font-normal text-muted-foreground">
                          （{age}歳）
                        </span>
                      )}
                    </p>

                    {/* Trade type tags */}
                    {skills.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-[33px] bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-body-xs text-primary"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Verification badges */}
                    <div className="mt-1 flex flex-wrap gap-2">
                      {applicant?.identity_verified && (
                        <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
                          <img
                            src="/images/icons/icon-tag.png"
                            alt=""
                            className="size-3.5"
                          />
                          本人確認済み
                        </span>
                      )}
                      {applicant?.ccus_verified && (
                        <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
                          <img
                            src="/images/icons/icon-tag.png"
                            alt=""
                            className="size-3.5"
                          />
                          CCUS登録済み
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Detail info */}
                <div className="mt-2 space-y-1 text-body-sm text-foreground">
                  {areas.length > 0 && (
                    <div className="flex items-center">
                      <img
                        src="/images/icons/icon-pin.png"
                        alt=""
                        className="size-4 shrink-0"
                      />
                      <span className="ml-1.5 w-[6.5rem] shrink-0">対応可能エリア</span>
                      <span>{areas.join("、")}</span>
                    </div>
                  )}
                  {maxExperience > 0 && (
                    <div className="flex items-center">
                      <img
                        src="/images/icons/icon-briefcase.png"
                        alt=""
                        className="size-4 shrink-0"
                      />
                      <span className="ml-1.5 w-[6.5rem] shrink-0">経験年数</span>
                      <span>{maxExperience}年</span>
                    </div>
                  )}
                </div>

                {/* 4. Applied job section */}
                <p className="mt-3 text-body-sm text-muted-foreground">
                  このユーザーは以下の案件に応募済みです
                </p>

                {/* 5. Inner job card */}
                <div className="mt-2 rounded-[8px] border border-border bg-background p-3">
                  <p className="text-body-md font-semibold text-foreground">
                    {job?.title ?? "不明な案件"}
                  </p>
                  <div className="mt-1 space-y-1 text-body-sm text-muted-foreground">
                    {job?.trade_type && (
                      <div className="flex">
                        <span className="w-16 shrink-0">募集職種</span>
                        <span>{job.trade_type}{job.headcount ? `・${job.headcount}人` : ""}</span>
                      </div>
                    )}
                    {job?.recruit_end_date && (
                      <div className="flex">
                        <span className="w-16 shrink-0">締め切り</span>
                        <span>{formatDate(job.recruit_end_date)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 6. Action buttons */}
                <div className="mt-4 flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full border-primary text-body-xs text-primary"
                    asChild
                  >
                    <Link href={`/users/contractors/${applicant?.id}`}>
                      ユーザー詳細をみる
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 rounded-full text-body-xs text-white"
                    asChild
                  >
                    <Link href={`/applications/orders/${app.id}`}>
                      発注内容詳細をみる
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalCount > ITEMS_PER_PAGE && (
        <PaginationControls
          totalCount={totalCount}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      )}

      <div className="mt-6">
        <BackButton />
      </div>
    </div>
  );
}
