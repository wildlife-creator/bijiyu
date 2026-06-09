import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { JobListCard } from "@/components/job-search/job-list-card";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { FavoriteTypeSelect } from "./favorite-type-select";
import { FavoriteSortButton } from "./favorite-sort-button";
import { SummaryWithOthers } from "@/components/master/summary-with-others";
import { AreaSummary } from "@/components/area/area-summary";
import { HighRatingBadge } from "@/components/shared/high-rating-badge";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";
import { fetchBulkOverallSummary } from "@/lib/rating/aggregate";
import {
  getUserDisplayName,
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type FavoriteType = "job" | "client" | "user";

const CONTRACTOR_TABS: { label: string; value: FavoriteType }[] = [
  { label: "案件", value: "job" },
  { label: "発注者", value: "client" },
];

const CLIENT_TABS: { label: string; value: FavoriteType }[] = [
  { label: "案件", value: "job" },
  { label: "発注者", value: "client" },
  { label: "見込みユーザー", value: "user" },
];

export default async function FavoritesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get user role
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = userData?.role ?? "contractor";
  const tabs = userRole === "contractor" ? CONTRACTOR_TABS : CLIENT_TABS;
  const activeType = (
    tabs.some((t) => t.value === (sp.type as string))
      ? (sp.type as FavoriteType)
      : tabs[0].value
  );
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * ITEMS_PER_PAGE;

  // 案件は締切順で並べ替え可能。sort 未指定なら締切が近い順 (asc) が既定。
  const sortAsc = (sp.sort as string) !== "desc";

  let targetIds: string[] = [];
  let totalCount = 0;

  if (activeType === "job") {
    // B案: 全件を締切順に並べてからページ分け。
    // まずお気に入り案件の全 target_id を取得し、jobs 側で締切順に並べて
    // 当該ページ分だけ取得する（複数ページでも正しく並ぶ）。
    const { data: allJobFavs } = await supabase
      .from("favorites")
      .select("target_id")
      .eq("user_id", user.id)
      .eq("target_type", "job");
    const allJobIds = (allJobFavs ?? []).map((f) => f.target_id);

    if (allJobIds.length > 0) {
      const { data: pagedJobs, count: jobCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact" })
        .in("id", allJobIds)
        .is("deleted_at", null)
        .order("recruit_end_date", { ascending: sortAsc, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + ITEMS_PER_PAGE - 1);
      targetIds = (pagedJobs ?? []).map((j) => j.id);
      totalCount = jobCount ?? 0;
    }
  } else {
    // 発注者・見込みユーザーはお気に入り登録順でページ分け（従来どおり）
    const { data: favorites, count } = await supabase
      .from("favorites")
      .select("id, target_id, target_type", { count: "exact" })
      .eq("user_id", user.id)
      .eq("target_type", activeType)
      .order("created_at", { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1);
    targetIds = (favorites ?? []).map((f) => f.target_id);
    totalCount = count ?? 0;
  }

  return (
    <div className="min-h-dvh bg-muted">
      {/* Header */}
      <div className="bg-background px-6 py-4 md:px-12">
        <h1 className="text-center text-heading-lg font-bold text-secondary">マイリスト</h1>
      </div>

      <div className="px-6 md:px-12">
        {/* フィルター行（CON-007）: 全N件は左、種類プルダウン + 並べ替え（案件のみ）は右にまとめる */}
        <div className="flex items-center justify-between gap-3 py-4">
          <p className="shrink-0 text-body-sm text-muted-foreground">
            全{totalCount}件
          </p>
          <div className="flex items-center gap-3">
            <FavoriteTypeSelect options={tabs} value={activeType} />
            {activeType === "job" && <FavoriteSortButton />}
          </div>
        </div>

        {/* Content per type */}
        {activeType === "job" && (
          <JobFavorites
            supabase={supabase}
            targetIds={targetIds}
            sortAsc={sortAsc}
          />
        )}
        {activeType === "client" && (
          <ClientFavorites supabase={supabase} targetIds={targetIds} />
        )}
        {activeType === "user" && (
          <UserFavorites supabase={supabase} targetIds={targetIds} />
        )}

        {targetIds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-body-md text-muted-foreground">
              マイリストに登録されたものはありません。
            </p>
          </div>
        )}

        {/* Pagination */}
        <PaginationControls
          totalCount={totalCount}
          itemsPerPage={ITEMS_PER_PAGE}
        />

        <BackButton />
      </div>
    </div>
  );
}

// --- Sub-components for each favorite type ---

async function JobFavorites({
  supabase,
  targetIds,
  sortAsc = true,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  targetIds: string[];
  /** 締切が近い順 (true) / 遠い順 (false)。Server ページの並びと一致させる */
  sortAsc?: boolean;
}) {
  if (targetIds.length === 0) return null;

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `
      id, title, description, trade_types,
      reward_lower, reward_upper, is_urgent,
      recruit_start_date, recruit_end_date, created_at,
      owner_id, organization_id,
      owner:users!owner_id(
        last_name, first_name, deleted_at,
        client_profiles(display_name, image_url)
      ),
      organization:organizations(
        owner_user:users!owner_id(
          last_name, first_name, deleted_at,
          client_profiles(display_name, image_url)
        )
      ),
      job_images(image_url, sort_order)
    `,
    )
    .in("id", targetIds)
    .is("deleted_at", null)
    .order("recruit_end_date", { ascending: sortAsc, nullsFirst: false })
    .order("id", { ascending: true });

  // master-area: bulk fetch job_areas
  const jobIds = (jobs ?? []).map((j) => j.id);
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

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
      {(jobs ?? []).map((job) => {
        const resolution = resolveClientProfileForRow(job);
        const companyName = resolveParticipantName({
          displayName: resolution.displayName,
          lastName: resolution.lastName,
          firstName: resolution.firstName,
          deletedAt: resolution.deletedAt,
        });
        const images =
          (job.job_images as Array<{
            image_url: string;
            sort_order: number;
          }>) ?? [];
        const thumbnail =
          images.sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ??
          null;

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
              companyName,
              thumbnailUrl: thumbnail,
            }}
            isFavorited={true}
          />
        );
      })}
    </div>
  );
}

async function ClientFavorites({
  supabase,
  targetIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  targetIds: string[];
}) {
  if (targetIds.length === 0) return null;

  const { data: clients } = await supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, deleted_at,
      client_profiles(display_name, image_url, recruit_job_types, working_way, address)
    `,
    )
    .in("id", targetIds)
    .eq("role", "client");

  // 発注者カードのエリアは「会社所在地（個人のお住まい）」ではなく
  // 「募集エリア」を表示する（CON-005 と整合）。client_recruit_areas を bulk fetch。
  const recruitAreasMap = new Map<string, AreaForDisplay[]>();
  const clientIds = (clients ?? []).map((c) => c.id);
  if (clientIds.length > 0) {
    const { data: areaRows } = await supabase
      .from("client_recruit_areas")
      .select("client_id, prefecture, municipality")
      .in("client_id", clientIds);
    for (const row of areaRows ?? []) {
      const list = recruitAreasMap.get(row.client_id) ?? [];
      list.push({ prefecture: row.prefecture, municipality: row.municipality });
      recruitAreasMap.set(row.client_id, list);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
      {(clients ?? []).map((client) => {
        const profile = Array.isArray(client.client_profiles)
          ? client.client_profiles[0]
          : client.client_profiles;
        const displayName = resolveParticipantName({
          displayName: profile?.display_name ?? null,
          lastName: client.last_name,
          firstName: client.first_name,
          deletedAt: client.deleted_at,
        });
        // 発注者一覧(CON-005)と同じく、会社が登録した画像を優先
        const avatarUrl = profile?.image_url ?? client.avatar_url;
        const clientAreas = recruitAreasMap.get(client.id) ?? [];

        return (
          <Card key={client.id} className="overflow-hidden rounded-[8px]">
            <CardContent className="p-4 space-y-3">
              {/* Avatar + Name + Address（CON-005 と同一） */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 shrink-0 rounded-full bg-muted overflow-hidden">
                  {avatarUrl ? (
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
                        className="w-6 h-6 opacity-40"
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-body-lg font-semibold truncate">
                    {displayName}
                  </h3>
                  {profile?.address && (
                    <p className="text-body-sm text-muted-foreground truncate">
                      {profile.address}
                    </p>
                  )}
                </div>
              </div>

              {/* Info rows（CON-005 と同じ項目名・順番） */}
              <div className="space-y-1.5 text-body-sm">
                {profile?.recruit_job_types && profile.recruit_job_types.length > 0 && (
                  <div className="flex items-center">
                    <img src="/images/icons/icon-briefcase.png" alt="" className="w-4 h-4 shrink-0" />
                    <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">募集職種</span>
                    <span className="line-clamp-1">
                      <SummaryWithOthers
                        items={profile.recruit_job_types}
                        maxVisible={2}
                      />
                    </span>
                  </div>
                )}
                {clientAreas.length > 0 && (
                  <div className="flex items-center">
                    <img src="/images/icons/icon-pin.png" alt="" className="w-4 h-4 shrink-0" />
                    <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">募集エリア</span>
                    <AreaSummary areas={clientAreas} className="line-clamp-1" />
                  </div>
                )}
                {profile?.working_way && profile.working_way.length > 0 && (
                  <div className="flex items-center">
                    <CalendarDays className="w-4 h-4 text-primary/70 shrink-0" />
                    <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">求める働き方</span>
                    <span className="line-clamp-1">{profile.working_way.join("、")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <FavoriteButton
                  targetType="client"
                  targetId={client.id}
                  initialIsFavorited={true}
                  variant="text"
                />
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="rounded-[47px] border-primary text-primary hover:bg-primary/10"
                >
                  <Link href={`/clients/${client.id}`}>詳細をみる</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

async function UserFavorites({
  supabase,
  targetIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  targetIds: string[];
}) {
  if (targetIds.length === 0) return null;

  // CLI-005（職人一覧）と整合: client role（個人発注者・小規模・法人 Owner）も
  // 受注者として活動しうるため、見込みユーザーとして表示対象に含める。
  // staff/admin はそもそも CLI-005 で favorite 登録できないため、ここでは role 絞りで除外する。
  const { data: users } = await supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, deleted_at, birth_date,
      identity_verified, ccus_verified,
      user_skills(trade_type, experience_years),
      user_available_areas(prefecture, municipality)
    `,
    )
    .in("id", targetIds)
    .in("role", ["contractor", "client"]);

  // CLI-005 と同じ高評価バッジ用に、評価サマリを一括取得
  const userIds = (users ?? []).map((u) => u.id);
  const summaryMap = await fetchBulkOverallSummary(supabase, userIds);

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
      {(users ?? []).map((u) => {
        const displayName = getUserDisplayName({
          lastName: u.last_name,
          firstName: u.first_name,
          deletedAt: u.deleted_at,
        });
        const skills = (u.user_skills as Array<{
          trade_type: string;
          experience_years: number | null;
        }>) ?? [];
        const areaRows = (u.user_available_areas as Array<{
          prefecture: string;
          municipality: string | null;
        }>) ?? [];
        const areas: AreaForDisplay[] = areaRows.map((a) => ({
          prefecture: a.prefecture,
          municipality: a.municipality,
        }));
        const age = u.birth_date ? calculateAge(u.birth_date) : null;

        return (
          <Card key={u.id} className="overflow-hidden rounded-[8px]">
            <CardContent className="p-4 space-y-3">
              {/* 高評価バッジ（CLI-005 と同一） */}
              <HighRatingBadge
                summary={summaryMap.get(u.id) ?? { avg: null, count: 0 }}
              />

              {/* Avatar + Name + Age + Skills + 認証バッジ（CLI-005 と同一） */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 shrink-0 rounded-full bg-muted overflow-hidden">
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <img
                        src="/images/icons/icon-avatar.png"
                        alt=""
                        className="w-6 h-6 opacity-40"
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-body-lg font-semibold truncate">
                    {displayName}
                    {age !== null && (
                      <span className="font-normal">（{age}歳）</span>
                    )}
                  </h3>
                  {skills.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {skills.map((s) => (
                        <span
                          key={s.trade_type}
                          className="rounded-[33px] bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-body-xs text-primary"
                        >
                          {s.trade_type}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {u.identity_verified && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <img
                          src="/images/icons/icon-tag.png"
                          alt=""
                          className="w-3.5 h-3.5"
                        />
                        本人確認済み
                      </span>
                    )}
                    {u.ccus_verified && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <img
                          src="/images/icons/icon-tag.png"
                          alt=""
                          className="w-3.5 h-3.5"
                        />
                        CCUS登録済み
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Info rows（CLI-005 と同じ項目名・順番） */}
              <div className="space-y-1.5 text-body-sm">
                <div className="flex items-center">
                  <img src="/images/icons/icon-pin.png" alt="" className="w-4 h-4 shrink-0" />
                  <span className="ml-1.5 w-[5rem] shrink-0 text-muted-foreground">対応エリア</span>
                  <AreaSummary areas={areas} className="line-clamp-1" />
                </div>
                {skills.length > 0 && (
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 text-primary/70 shrink-0" />
                    <span className="ml-1.5 w-[5rem] shrink-0 text-muted-foreground">経験年数</span>
                    <span className="line-clamp-1">
                      {skills
                        .filter((s) => s.experience_years)
                        .map((s) => `${s.trade_type} ${s.experience_years}年`)
                        .join("、") || "—"}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <FavoriteButton
                  targetType="user"
                  targetId={u.id}
                  initialIsFavorited={true}
                  variant="text"
                />
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="rounded-[47px] border-primary text-primary hover:bg-primary/10"
                >
                  <Link href={`/users/contractors/${u.id}`}>詳細をみる</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
