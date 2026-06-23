import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { BackButton } from "@/components/job-search/back-button";
import { JobListCard } from "@/components/job-search/job-list-card";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { AreaList } from "@/components/area/area-list";
import { VideoEmbed } from "@/components/video-embed/video-embed";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { hasActiveOption } from "@/lib/billing/options";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveParticipantName } from "@/lib/utils/display-name";
import { canSendJobInquiry } from "@/lib/job-inquiry/access-guard";
import {
  resolveTargetOrganizationId,
  resolveViewerOrganizationId,
} from "@/lib/job-inquiry/resolve-context";
import { InquirySuccessToast } from "./inquiry-success-toast";

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
  if (value == null || (isString && !value)) return null;
  return (
    <div className="flex border-b border-border py-3">
      <span className="w-28 shrink-0 text-body-md font-medium text-secondary">
        {label}
      </span>
      {isString ? (
        <span className="flex-1 text-body-md text-foreground">{value}</span>
      ) : (
        <div className="flex-1 text-body-md text-foreground">{value}</div>
      )}
    </div>
  );
}


export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch client user data with profile
  const { data: client } = await supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name,
      deleted_at, role, prefecture,
      client_profiles(
        display_name, image_url, address,
        recruit_job_types, working_way,
        employee_scale, message, language,
        workplace_video_url
      )
    `,
    )
    .eq("id", id)
    .eq("role", "client")
    .single();

  if (!client) notFound();

  // master-area: fetch client_recruit_areas for display
  const { data: clientAreaRows } = await supabase
    .from("client_recruit_areas")
    .select("prefecture, municipality")
    .eq("client_id", id);
  const clientAreas: AreaForDisplay[] = (clientAreaRows ?? []).map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));

  const isDeleted = !!client.deleted_at;
  const profile = Array.isArray(client.client_profiles)
    ? client.client_profiles[0]
    : client.client_profiles;

  const displayName = resolveParticipantName({
    displayName: profile?.display_name ?? null,
    lastName: client.last_name,
    firstName: client.first_name,
    deletedAt: client.deleted_at,
  });
  // 発注者アバターは client_profiles.image_url を優先し、未設定なら users.avatar_url
  const avatarUrl = profile?.image_url ?? client.avatar_url;

  // 他者組織の解決は admin client（resolveTargetOrganizationId / hasActiveOption の前提）。
  // 掲載案件の会社単位表示・職場紹介動画判定・お問い合わせ判定で共用する。
  const adminClient = createAdminClient();
  // 見ている発注者(id)が法人 Owner なら、その組織IDを掲載案件の会社単位スコープに使う。
  // 個人発注者は null（従来どおり owner_id 軸）。
  const targetOrgId = await resolveTargetOrganizationId(adminClient, id);

  // 職場紹介動画: workplace_video_url 設定済み かつ active な 'video_workplace'
  // オプションがある場合のみ表示。cross-user 参照のため active 判定は
  // admin（service-role）client で行う（要件 5.1/5.3）。
  const showWorkplaceVideo =
    !!profile?.workplace_video_url &&
    !isDeleted &&
    (await hasActiveOption(adminClient, id, "video_workplace"));

  // Fetch client's open jobs with thumbnail + urgency info.
  // 法人 Owner を見ている場合は会社全体（organization_id 軸＝担当者作成案件も含む）、
  // 個人発注者なら従来どおり本人の案件のみ（owner_id 軸）。
  let jobsQuery = supabase
    .from("jobs")
    .select(
      `id, title, trade_types, reward_lower, reward_upper,
       is_urgent, recruit_end_date,
       job_images(image_url, sort_order)`,
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  jobsQuery = targetOrgId
    ? jobsQuery.eq("organization_id", targetOrgId)
    : jobsQuery.eq("owner_id", id);
  const { data: jobs } = await jobsQuery;

  // Get job favorites for these jobs
  const jobIds = (jobs ?? []).map((j) => j.id);

  // master-area: bulk fetch job_areas for cards
  const jobAreasMap = new Map<string, AreaForDisplay[]>();
  if (jobIds.length > 0) {
    const { data: areaRows } = await supabase
      .from("job_areas")
      .select("job_id, prefecture, municipality")
      .in("job_id", jobIds);
    for (const row of areaRows ?? []) {
      const list = jobAreasMap.get(row.job_id) ?? [];
      list.push({ prefecture: row.prefecture, municipality: row.municipality });
      jobAreasMap.set(row.job_id, list);
    }
  }
  const { data: jobFavorites } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", user.id)
    .eq("target_type", "job")
    .in("target_id", jobIds.length > 0 ? jobIds : ["__none__"]);

  const favoritedJobIds = new Set(
    (jobFavorites ?? []).map((f) => f.target_id),
  );

  // Check client favorite status
  const { data: favorite } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", "client")
    .eq("target_id", id)
    .maybeSingle();

  // 「求人へのお問い合わせ」ボタンの表示判定。
  // Server Action(submitJobInquiryAction) のガードと同一の純粋関数 canSendJobInquiry を
  // 呼ぶことで UI と許可範囲を一致させる（self / deleted / same_org / admin で非表示）。
  const { data: viewerRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  // targetOrgId / adminClient は掲載案件取得の前で解決済み（上部参照）。
  const viewerOrgId = await resolveViewerOrganizationId(adminClient, user.id, supabase);
  const canInquire = canSendJobInquiry({
    viewer: {
      id: user.id,
      role: viewerRow?.role ?? null,
      organizationId: viewerOrgId,
    },
    target: {
      id: client.id,
      deletedAt: client.deleted_at,
      organizationId: targetOrgId,
    },
  }).ok;

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <InquirySuccessToast />
      <h1 className="text-center text-heading-lg font-bold text-secondary">発注者詳細</h1>

      {/* Profile header */}
      <div className="mt-4 flex items-center gap-4">
        <div className="w-16 h-16 shrink-0 rounded-full bg-muted overflow-hidden">
          {avatarUrl && !isDeleted ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="w-8 h-8 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-md font-bold text-foreground truncate">
            {displayName}
          </h2>
        </div>
      </div>

      {/* Action buttons */}
      {!isDeleted && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FavoriteButton
            targetType="client"
            targetId={id}
            initialIsFavorited={!!favorite}
            showLabel
          />
          <div className="flex-1" />
          {canInquire && (
            <Button
              asChild
              variant="outline"
              className="rounded-[47px] border-primary bg-background text-primary hover:bg-primary/5 hover:text-primary"
            >
              <Link href={`/clients/${id}/inquiry`}>求人へのお問い合わせ</Link>
            </Button>
          )}
          <Button
            asChild
            className="rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href={`/messages/new?to=${id}`}>メッセージを送る</Link>
          </Button>
        </div>
      )}

      {isDeleted && (
        <div className="mt-4 rounded-[8px] bg-muted p-4">
          <p className="text-body-md text-muted-foreground">
            このユーザーは退会済みです。
          </p>
        </div>
      )}

      {/* 職場紹介動画（アクションボタン直下・募集職種より上） */}
      {showWorkplaceVideo && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">職場紹介動画</h3>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <VideoEmbed
              url={profile!.workplace_video_url!}
              label="職場紹介動画"
            />
          </div>
        </section>
      )}

      {/* Detail rows */}
      <div className="mt-6">
        <DetailRow label="住所" value={profile?.address ?? null} />
        {/* 「エリア」(users.prefecture = owner 個人居住県) は業務プロフィールに不要かつ
            プライバシー観点でも他人に開示しない方が良いため非表示。
            2026-05-20 Phase 9 シナリオ C で混乱の元と判明したため削除。 */}
        <DetailRow
          label="募集職種"
          value={
            profile?.recruit_job_types && profile.recruit_job_types.length > 0 ? (
              <CollapsibleList
                items={profile.recruit_job_types}
                initialLimit={5}
              />
            ) : null
          }
        />
        <DetailRow
          label="募集エリア"
          value={
            clientAreas.length > 0 ? <AreaList areas={clientAreas} /> : null
          }
        />
        <DetailRow
          label="従業員規模"
          value={profile?.employee_scale ? `${profile.employee_scale}名` : null}
        />
        <DetailRow
          label="求める働き方"
          value={(profile?.working_way ?? []).join("、") || null}
        />
        <DetailRow
          label="言語"
          value={(profile?.language ?? []).join("、") || null}
        />
      </div>

      {/* Message from client */}
      {profile?.message && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">
            発注者メッセージ
          </h3>
          <p className="mt-2 text-body-md text-foreground whitespace-pre-wrap">
            {profile.message}
          </p>
        </section>
      )}

      {/* Open jobs */}
      <section className="mt-6 bleed-viewport py-6 bg-muted">
        <h3 className="text-body-lg font-bold text-foreground">
          掲載中の案件
        </h3>
        {(!jobs || jobs.length === 0) ? (
          <p className="mt-2 text-body-md text-muted-foreground">
            現在掲載中の案件はありません
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2">
            {jobs.map((job) => {
              const images = job.job_images as { image_url: string; sort_order: number }[] | null;
              const thumbnail = images && images.length > 0
                ? [...images].sort((a, b) => a.sort_order - b.sort_order)[0].image_url
                : null;

              return (
                <JobListCard
                  key={job.id}
                  job={{
                    id: job.id,
                    title: job.title,
                    tradeTypes: job.trade_types,
                    areas: jobAreasMap.get(job.id) ?? [],
                    rewardLower: job.reward_lower,
                    rewardUpper: job.reward_upper,
                    isUrgent: job.is_urgent ?? false,
                    recruitEndDate: job.recruit_end_date ?? "",
                    // この画面の案件はすべてこの client の案件なので、
                    // ページ上部で解決済みの displayName を利用する
                    companyName: displayName,
                    thumbnailUrl: thumbnail,
                  }}
                  isFavorited={favoritedJobIds.has(job.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      <BackButton />
      </div>
    </div>
  );
}
