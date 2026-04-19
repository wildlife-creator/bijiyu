import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { JobListCard } from "@/components/job-search/job-list-card";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { createClient } from "@/lib/supabase/server";
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

  // Fetch favorites for active type
  const { data: favorites, count } = await supabase
    .from("favorites")
    .select("id, target_id, target_type", { count: "exact" })
    .eq("user_id", user.id)
    .eq("target_type", activeType)
    .order("created_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const targetIds = (favorites ?? []).map((f) => f.target_id);

  return (
    <div className="min-h-dvh bg-muted">
      {/* Header */}
      <div className="bg-background px-6 py-4 md:px-12">
        <h1 className="text-center text-heading-lg font-bold text-secondary">マイリスト</h1>
      </div>

      <div className="px-6 md:px-12">
        {/* Tab selector */}
        <div className="py-4">
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <Link
                key={tab.value}
                href={`/favorites?type=${tab.value}`}
                className={`rounded-[47px] px-4 py-2 text-body-sm font-medium transition-colors ${
                  activeType === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border border-border hover:bg-muted/50"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-body-sm text-muted-foreground pb-4">
          全{count ?? 0}件
        </p>

        {/* Content per type */}
        {activeType === "job" && (
          <JobFavorites supabase={supabase} targetIds={targetIds} />
        )}
        {activeType === "client" && (
          <ClientFavorites supabase={supabase} targetIds={targetIds} />
        )}
        {activeType === "user" && (
          <UserFavorites supabase={supabase} targetIds={targetIds} />
        )}

        {(favorites ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-body-md text-muted-foreground">
              マイリストに登録されたものはありません。
            </p>
          </div>
        )}

        {/* Pagination */}
        <PaginationControls
          totalCount={count ?? 0}
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
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  targetIds: string[];
}) {
  if (targetIds.length === 0) return null;

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `
      id, title, description, trade_type, prefecture,
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
    .is("deleted_at", null);

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
              tradeType: job.trade_type ?? "",
              prefecture: job.prefecture ?? "",
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
      id, avatar_url, last_name, first_name, deleted_at, prefecture,
      client_profiles(display_name, recruit_job_types, recruit_area, working_way)
    `,
    )
    .in("id", targetIds)
    .eq("role", "client");

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

        return (
          <Card key={client.id} className="overflow-hidden rounded-[8px]">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 shrink-0 rounded-full bg-muted overflow-hidden">
                  {client.avatar_url ? (
                    <img
                      src={client.avatar_url}
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
                </div>
              </div>

              <div className="space-y-1.5 text-body-sm">
                {client.prefecture && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src="/images/icons/icon-pin.png"
                      alt=""
                      className="w-4 h-4"
                    />
                    <span>{client.prefecture}</span>
                  </div>
                )}
                {profile?.recruit_job_types && profile.recruit_job_types.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src="/images/icons/icon-briefcase.png"
                      alt=""
                      className="w-4 h-4"
                    />
                    <span className="line-clamp-1">
                      {profile.recruit_job_types.join(", ")}
                    </span>
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

  const { data: users } = await supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, deleted_at, birth_date,
      identity_verified, ccus_verified,
      user_skills(trade_type, experience_years),
      user_available_areas(prefecture)
    `,
    )
    .in("id", targetIds)
    .eq("role", "contractor");

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
        const areas = (u.user_available_areas as Array<{
          prefecture: string;
        }>) ?? [];

        return (
          <Card key={u.id} className="overflow-hidden rounded-[8px]">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
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
                  </h3>
                </div>
              </div>

              <div className="space-y-1.5 text-body-sm">
                {skills.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src="/images/icons/icon-briefcase.png"
                      alt=""
                      className="w-4 h-4"
                    />
                    <span className="line-clamp-1">
                      {skills.map((s) => s.trade_type).join(", ")}
                    </span>
                  </div>
                )}
                {areas.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src="/images/icons/icon-globe.png"
                      alt=""
                      className="w-4 h-4"
                    />
                    <span className="line-clamp-1">
                      {areas.map((a) => a.prefecture).join(", ")}
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
