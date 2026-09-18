import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { AreaList } from "@/components/area/area-list";
import { VideoList } from "@/components/video-embed/video-list";
import { RatingSummaryCard } from "@/components/reviews/rating-summary-card";
import { CommentListCard } from "@/components/reviews/comment-list-card";
import { CommentsPagination } from "@/components/reviews/comments-pagination";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { resolveBackTo } from "@/lib/admin/back-to";
import { fetchPerItemSummary } from "@/lib/rating/aggregate";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatResidence } from "@/lib/utils/format-residence";
import { VIDEO_SECTION_LABEL } from "@/lib/videos/constants";
import { getReadyVideos } from "@/lib/videos/fetch";
import { OpsAccountBadge } from "@/components/admin/ops-account-badge";
import { BankTransferPanel } from "@/components/admin/bank-transfer-panel";
import { formatDateJst } from "@/lib/utils/format-date";
import {
  isVideoOption,
  VIDEO_OPTION_TYPES,
  VIDEO_OPTION_UI_NAMES,
} from "@/lib/billing/options";
import { PAYMENT_METHOD_LABELS, type PaidPlanType } from "@/lib/constants/plans";
import { DeleteAccountButton } from "@/app/admin/(protected)/clients/[id]/delete-account-button";
import { DeleteUserButton } from "./delete-user-button";

// アカウント削除の退会カスケード（メール送信を含む）がタイムアウトしないよう
// Server Action の実行時間上限を延長する
export const maxDuration = 60;

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
  // 公開リダイレクター悪用を避けるため /admin/ 始まりのみ受け入れる（resolveBackTo）。
  const rawBackTo = resolveBackTo(sp.backTo);
  const backTo = rawBackTo ?? "/admin/users";
  const admin = createAdminClient();

  const { data: u } = await admin
    .from("users")
    .select(
      `id, role, avatar_url, last_name, first_name, birth_date, deleted_at,
       identity_verified, ccus_verified, bio, prefecture, municipality, gender,
       skill_tags, is_hidden,
       user_skills(trade_type, experience_years),
       user_qualifications(qualification_name),
       user_available_areas(prefecture, municipality)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!u) notFound();

  // 銀行振込（P12）の枠で使う現在の契約
  const { data: activeSubscription } = await admin
    .from("subscriptions")
    .select("id, plan_type, status, payment_method, current_period_end")
    .eq("user_id", id)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // 銀行振込枠の「購入済みの動画プラン」（カード・銀行振込の両方。買い切りなので複数行ありうる）。
  // 二重の有効化に運営が気づけるようにするための表示専用データ
  const { data: videoOptionRows } = await admin
    .from("option_subscriptions")
    .select("id, option_type, payment_method, start_date, created_at")
    .eq("user_id", id)
    .in("option_type", [...VIDEO_OPTION_TYPES])
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  const videoPurchases = (videoOptionRows ?? []).flatMap((r) =>
    isVideoOption(r.option_type)
      ? [
          {
            id: r.id,
            // 旧 職場紹介動画（video_workplace）は統合先の名前だけを出す（「旧:」の注記は付けない）
            planName:
              VIDEO_OPTION_UI_NAMES[r.option_type === "video_workplace" ? "video" : r.option_type],
            purchasedOnLabel: formatDateJst(r.start_date ?? r.created_at),
            paymentMethodLabel: PAYMENT_METHOD_LABELS[r.payment_method],
          },
        ]
      : [],
  );

  // 発注者でもある会員の削除確認で「配下の担当者も削除される」警告を出すか（ADM-004 と同じ判定）
  let hasOrganization = false;
  if (u.role === "client") {
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", id)
      .maybeSingle();
    hasOrganization = !!org;
  }

  // PR動画（公開中のみ）。P4 でオプション購入によるゲートは撤廃。
  // 退会済みでも登録済みの動画は運営者が後から確認できるよう表示を維持する
  const prVideos = await getReadyVideos(admin, id, "contractor_page");

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

  // 運営者には退会済みでも実名を見せる（状態は ※退会済み バッジで示す）
  const displayName = getUserDisplayName({
    lastName: u.last_name,
    firstName: u.first_name,
    deletedAt: null,
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

  const isDeleted = !!u.deleted_at;

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザーアカウント詳細
      </h1>

      {/* ヘッダー（アバター + 氏名 + バッジ） */}
      <div className="mt-6 flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-full bg-background border border-border/30">
          {u.avatar_url ? (
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
            {u.is_hidden && <OpsAccountBadge className="ml-2" />}
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

      {/* プロフィール動画（職人ページ掲載分・公開中の動画が 1 本以上あるときのみ） */}
      {prVideos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">{VIDEO_SECTION_LABEL}</h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <VideoList videos={prVideos} label={VIDEO_SECTION_LABEL} />
          </div>
        </section>
      )}

      {/* 動画管理画面（ADM-027）への導線。P4 で購入ゲートを撤廃し常時表示
          （退会済みは出さない）。発注者詳細 ADM-004 の動画ボタンと色・配置をそろえる */}
      {!isDeleted && (
        <div className="mt-3 flex justify-end">
          <Button
            asChild
            className="rounded-full bg-primary text-white hover:bg-primary/90"
          >
            <Link
              href={`/admin/users/${id}/videos?placement=contractor_page&backTo=${encodeURIComponent(`/admin/users/${id}`)}`}
            >
              動画を投稿/編集する
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

      {/* 発注者からの評価（★×5 7項目サマリー。評価詳細ページと同じ共有部品） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">発注者からの評価</h2>
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

      {/* 銀行振込（P12）: 契約は会員に紐づくため、枠はこの画面だけ（ADM-004 には置かない）。契約主体になれる contractor / client のみ。
          退会済み・担当者（staff）・管理者には出さない */}
      {!isDeleted && (u.role === "contractor" || u.role === "client") && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">銀行振込</h2>
          <BankTransferPanel
            userId={id}
            videoPurchases={videoPurchases}
            subscription={
              activeSubscription
                ? {
                    id: activeSubscription.id,
                    planType: activeSubscription.plan_type as PaidPlanType,
                    paymentMethod: activeSubscription.payment_method,
                    status: activeSubscription.status as "active" | "past_due",
                    periodEndLabel:
                      activeSubscription.payment_method === "stripe" &&
                      activeSubscription.current_period_end
                        ? formatDateJst(activeSubscription.current_period_end)
                        : null,
                  }
                : null
            }
          />
        </section>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo}>もどる</Link>
        </Button>

        {/* 削除: 受注者は deleteUserAccountAction、発注者でもある会員は ADM-004 と同じ
            deleteClientAccountAction（Stripe 解約＋配下スタッフ連動削除）を呼ぶ。処理は二重に作らない */}
        {u.role === "contractor" && !isDeleted && (
          <DeleteUserButton userId={id} />
        )}
        {u.role === "client" && !isDeleted && (
          <DeleteAccountButton
            userId={id}
            hasOrganization={hasOrganization}
            origin="users"
          />
        )}
      </div>
    </div>
  );
}
