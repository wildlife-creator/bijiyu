import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/shared/back-button";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { RatingSummaryCard } from "@/components/reviews/rating-summary-card";
import { CommentListCard } from "@/components/reviews/comment-list-card";
import { CommentsPagination } from "@/components/reviews/comments-pagination";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { calculateAge } from "@/lib/utils/calculate-age";
import { fetchPerItemSummary } from "@/lib/rating/aggregate";

const COMMENTS_PER_PAGE = 20;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sp?: string; cp?: string }>;
}

export default async function ContractorReviewsPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const { sp: statusPageParam, cp: commentPageParam } = await searchParams;
  const statusPage = Math.max(1, parseInt(statusPageParam || "1", 10) || 1);
  const commentPage = Math.max(1, parseInt(commentPageParam || "1", 10) || 1);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch contractor user info
  const { data: contractorUser } = await supabase
    .from("users")
    .select(
      "id, avatar_url, last_name, first_name, birth_date, deleted_at, identity_verified, ccus_verified",
    )
    .eq("id", id)
    .single();

  if (!contractorUser) {
    notFound();
  }

  const isDeleted = !!contractorUser.deleted_at;
  const contractorName = getUserDisplayName({
    lastName: contractorUser.last_name,
    firstName: contractorUser.first_name,
    deletedAt: contractorUser.deleted_at,
  });
  const age = contractorUser.birth_date
    ? calculateAge(contractorUser.birth_date)
    : null;

  // Fetch favorite status
  const { data: favorite } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", "user")
    .eq("target_id", id)
    .maybeSingle();

  // 7項目の★平均・件数（任意項目は評価あり件のみで平均）
  const perItem = await fetchPerItemSummary(supabase, id);

  // Fetch reviews for status/comment pagination（補足一覧用、評価カラムは集計ヘルパで取得済み）
  const { data: reviews } = await supabase
    .from("user_reviews")
    .select("id, status_supplement, comment, created_at")
    .eq("reviewee_id", id)
    .order("created_at", { ascending: false });

  // Paginate status supplements
  const reviewsWithStatus =
    reviews?.filter((r) => r.status_supplement) ?? [];
  const totalStatusItems = reviewsWithStatus.length;
  const totalStatusPages = Math.max(
    1,
    Math.ceil(totalStatusItems / COMMENTS_PER_PAGE),
  );
  const safeStatusPage = Math.min(statusPage, totalStatusPages);
  const statusStartIndex = (safeStatusPage - 1) * COMMENTS_PER_PAGE;
  const paginatedStatus = reviewsWithStatus.slice(
    statusStartIndex,
    statusStartIndex + COMMENTS_PER_PAGE,
  );

  // Paginate comments
  const reviewsWithComments = reviews?.filter((r) => r.comment) ?? [];
  const totalComments = reviewsWithComments.length;
  const totalCommentPages = Math.max(
    1,
    Math.ceil(totalComments / COMMENTS_PER_PAGE),
  );
  const safeCommentPage = Math.min(commentPage, totalCommentPages);
  const commentStartIndex = (safeCommentPage - 1) * COMMENTS_PER_PAGE;
  const paginatedComments = reviewsWithComments.slice(
    commentStartIndex,
    commentStartIndex + COMMENTS_PER_PAGE,
  );

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者評価
      </h1>

      {/* User profile section */}
      <div className="mt-4 flex items-center gap-3">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
          {contractorUser.avatar_url && !isDeleted ? (
            <img
              src={contractorUser.avatar_url}
              alt={contractorName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="h-8 w-8 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body-lg font-bold text-foreground">
            {contractorName}
            {age !== null && !isDeleted && (
              <span className="ml-1">（{age}歳）</span>
            )}
          </p>
        </div>
        {!isDeleted && (
          <FavoriteButton
            targetType="user"
            targetId={id}
            initialIsFavorited={!!favorite}
          />
        )}
      </div>

      {/* Badges */}
      {!isDeleted &&
        (contractorUser.identity_verified || contractorUser.ccus_verified) && (
          <div className="mt-2 ml-[68px] flex items-center gap-3">
            {contractorUser.identity_verified && (
              <span className="flex items-center gap-1 text-body-sm">
                <img
                  src="/images/icons/icon-tag.png"
                  alt=""
                  className="h-4 w-4"
                />
                本人確認済み
              </span>
            )}
            {contractorUser.ccus_verified && (
              <span className="flex items-center gap-1 text-body-sm">
                <img
                  src="/images/icons/icon-tag.png"
                  alt=""
                  className="h-4 w-4"
                />
                CCUS登録済み
              </span>
            )}
          </div>
        )}

      {/* 7-item rating summary（★平均 + 件数。任意項目0件は「未評価」） */}
      <div className="mt-6">
        <RatingSummaryCard perItem={perItem} />
      </div>

      {/* Status supplement comments */}
      <div className="mt-4">
        <CommentListCard
          title="稼働状況の補足"
          items={paginatedStatus.map((r) => ({
            id: r.id,
            text: r.status_supplement!,
          }))}
        />
      </div>

      <CommentsPagination
        currentPage={safeStatusPage}
        totalPages={totalStatusPages}
        pageSize={COMMENTS_PER_PAGE}
        hrefForPage={(p) => `/users/${id}/reviews?sp=${p}&cp=${safeCommentPage}`}
      />

      {/* Review comments */}
      <div className="mt-4">
        <CommentListCard
          title="評価の補足"
          items={paginatedComments.map((r) => ({
            id: r.id,
            text: r.comment!,
          }))}
        />
      </div>

      <CommentsPagination
        currentPage={safeCommentPage}
        totalPages={totalCommentPages}
        pageSize={COMMENTS_PER_PAGE}
        hrefForPage={(p) => `/users/${id}/reviews?sp=${safeStatusPage}&cp=${p}`}
      />

      <div className="mt-6 flex justify-center">
        <BackButton className="max-w-xs" />
      </div>
    </div>
  );
}
