import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { AreaList } from "@/components/area/area-list";
import { VideoEmbed } from "@/components/video-embed/video-embed";
import { RatingSummaryCard } from "@/components/reviews/rating-summary-card";
import { CommentListCard } from "@/components/reviews/comment-list-card";
import { CommentsPagination } from "@/components/reviews/comments-pagination";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { hasActiveOption } from "@/lib/billing/options";
import { fetchPerItemSummary } from "@/lib/rating/aggregate";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatResidence } from "@/lib/utils/format-residence";
import { DeleteUserButton } from "./delete-user-button";

const COMMENTS_PER_PAGE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ commentsPage?: string; backTo?: string }>;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
}) {
  const isString = typeof value === "string";
  if (value == null || (isString && !value)) return null;
  return (
    <>
      <div className="bg-primary/[0.08] px-4 py-2">
        <span className="text-body-sm font-medium">{label}</span>
      </div>
      <div className="px-4 py-2">
        {isString ? <span className="text-body-sm">{value}</span> : value}
      </div>
    </>
  );
}

/**
 * ADM-009: ユーザーアカウント詳細。
 * デザインカンプ: design-assets/screens/ADM-009.png
 * （カンプの発注者評価 Good/Bad 6項目は旧仕様のため ★×5 7項目サマリーで実装。
 *   職場紹介動画の投稿入口は ADM-004 へ移設済みのため本画面には置かない）
 */
export default async function AdminUserDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const commentsPage = Math.max(
    1,
    Number.parseInt(sp.commentsPage ?? "1", 10) || 1,
  );
  // backTo は admin 配下の遷移元（応募詳細など）からの一時的な戻り先指定。
  // 公開リダイレクター悪用を避けるため /admin/ 始まりのみ受け入れる。
  const backTo =
    typeof sp.backTo === "string" && sp.backTo.startsWith("/admin/")
      ? sp.backTo
      : "/admin/users";
  const admin = createAdminClient();

  const { data: u } = await admin
    .from("users")
    .select(
      `id, role, avatar_url, last_name, first_name, birth_date, deleted_at,
       identity_verified, ccus_verified, bio, prefecture, municipality, gender,
       skill_tags, video_url,
       user_skills(trade_type, experience_years),
       user_qualifications(qualification_name),
       user_available_areas(prefecture, municipality)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!u) notFound();

  // active オプション判定（admin 画面のため admin client で一貫して判定）
  const hasVideo = await hasActiveOption(admin, id, "video");

  // 発注者からの評価（★×5 7項目サマリー + 評価の補足コメント）
  const perItem = await fetchPerItemSummary(admin, id);
  const { data: reviews } = await admin
    .from("user_reviews")
    .select("id, comment, created_at")
    .eq("reviewee_id", id)
    .order("created_at", { ascending: false });
  const reviewsWithComments = (reviews ?? []).filter((r) => r.comment);
  const totalCommentPages = Math.max(
    1,
    Math.ceil(reviewsWithComments.length / COMMENTS_PER_PAGE),
  );
  const safeCommentsPage = Math.min(commentsPage, totalCommentPages);
  const commentStartIndex = (safeCommentsPage - 1) * COMMENTS_PER_PAGE;
  const paginatedComments = reviewsWithComments.slice(
    commentStartIndex,
    commentStartIndex + COMMENTS_PER_PAGE,
  );

  const displayName = getUserDisplayName({
    lastName: u.last_name,
    firstName: u.first_name,
    deletedAt: u.deleted_at,
  });
  const age = u.birth_date ? calculateAge(u.birth_date) : null;

  const skills =
    (u.user_skills as { trade_type: string; experience_years: number | null }[]) ??
    [];
  const qualifications =
    (u.user_qualifications as { qualification_name: string }[]) ?? [];
  const areaRows =
    (u.user_available_areas as { prefecture: string; municipality: string | null }[]) ??
    [];
  const areas: AreaForDisplay[] = areaRows.map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));
  const skillTags = (u.skill_tags ?? []) as string[];

  const showVideo = !!u.video_url && hasVideo;
  const isDeleted = !!u.deleted_at;

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザーアカウント詳細
      </h1>

      {/* ヘッダー（アバター + 氏名 + バッジ） */}
      <div className="mt-6 flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-full bg-background border border-border/30">
          {u.avatar_url && !isDeleted ? (
            <img
              src={u.avatar_url}
              alt={displayName}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="size-8 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body-lg font-bold text-foreground">
            {displayName}
            {age !== null && (
              <span className="text-body-md font-normal">（{age}歳）</span>
            )}
            {isDeleted && (
              <span className="ml-2 text-body-sm font-bold text-muted-foreground">
                ※退会済み
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-body-sm">
            {u.identity_verified && (
              <span className="flex items-center gap-1">
                <img
                  src="/images/icons/icon-tag.png"
                  alt=""
                  className="size-3.5"
                />
                本人確認済み
              </span>
            )}
            {u.ccus_verified && (
              <span className="flex items-center gap-1">
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

      {/* PR動画（video_url 設定済み かつ active な 'video' がある場合のみ） */}
      {showVideo && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">PR動画</h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <VideoEmbed url={u.video_url!} label="PR動画" />
          </div>
        </section>
      )}

      {/* 受注者PR動画の投稿ボタン（active 'video' のみ・退会済みは出さない。
          発注者詳細 ADM-004 の職場紹介動画ボタンと色・配置をそろえる） */}
      {hasVideo && !isDeleted && (
        <div className="mt-3 flex justify-end">
          <Button
            asChild
            className="rounded-full bg-primary text-white hover:bg-primary/90"
          >
            <Link href={`/admin/users/${id}/video`}>
              受注者PR動画を投稿/編集する
            </Link>
          </Button>
        </div>
      )}

      {/* 基本情報 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/10 bg-background">
          <InfoRow
            label="居住地"
            value={formatResidence(u.prefecture, u.municipality)}
          />
          <InfoRow label="性別" value={u.gender} />
          <InfoRow
            label="対応可能エリア"
            value={areas.length > 0 ? <AreaList areas={areas} /> : null}
          />
        </div>
      </section>

      {/* 自己紹介 */}
      {u.bio && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">自己紹介</h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <p className="whitespace-pre-wrap text-body-sm text-foreground">
              {u.bio}
            </p>
          </div>
        </section>
      )}

      {/* 能力 */}
      {(skills.length > 0 || skillTags.length > 0 || qualifications.length > 0) && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">能力</h2>
          <div className="mt-2 overflow-hidden rounded-[8px] border border-border/10 bg-background">
            {skills.length > 0 && (
              <>
                <InfoRow
                  label="対応できる職種"
                  value={
                    <CollapsibleList
                      items={skills.map((s) => s.trade_type)}
                      initialLimit={5}
                    />
                  }
                />
                <InfoRow
                  label="経験年数"
                  value={
                    skills
                      .filter((s) => s.experience_years)
                      .map((s) => `${s.trade_type} ${s.experience_years}年`)
                      .join("、") || null
                  }
                />
              </>
            )}
            {skillTags.length > 0 && (
              <InfoRow
                label="保有スキル"
                value={<CollapsibleList items={skillTags} initialLimit={8} />}
              />
            )}
            {qualifications.length > 0 && (
              <InfoRow
                label="保有資格"
                value={
                  <CollapsibleList
                    items={qualifications.map((q) => q.qualification_name)}
                    initialLimit={5}
                  />
                }
              />
            )}
          </div>
        </section>
      )}

      {/* 発注者評価（★×5 7項目サマリー。評価詳細ページと同じ共有部品） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">発注者評価</h2>
        <div className="mt-2">
          <RatingSummaryCard perItem={perItem} />
        </div>
      </section>

      {/* 評価の補足コメント一覧（20件ページング） */}
      <section className="mt-4">
        <CommentListCard
          title="評価の補足"
          items={paginatedComments.map((r) => ({
            id: r.id,
            text: r.comment!,
          }))}
        />
        <CommentsPagination
          currentPage={safeCommentsPage}
          totalPages={totalCommentPages}
          pageSize={COMMENTS_PER_PAGE}
          hrefForPage={(p) => `/admin/users/${id}?commentsPage=${p}`}
        />
      </section>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo}>もどる</Link>
        </Button>

        {/* 削除は contractor のみ。client は ADM-004（Stripe 解約＋配下スタッフ連動削除）に一本化 */}
        {u.role === "contractor" && !isDeleted && (
          <DeleteUserButton userId={id} />
        )}
        {u.role === "client" && (
          <Button
            asChild
            variant="outline"
            className="w-full max-w-xs rounded-full border-secondary text-secondary"
          >
            <Link href={`/admin/clients/${id}`}>発注者詳細</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
