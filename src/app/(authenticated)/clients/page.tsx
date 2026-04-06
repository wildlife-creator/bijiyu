import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { SearchFilterSheet } from "@/components/job-search/search-filter-sheet";
import { createClient } from "@/lib/supabase/server";
import { getUserDisplayName } from "@/lib/utils/display-name";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * ITEMS_PER_PAGE;
  const q = (sp.q as string) ?? "";
  const prefecture = (sp.prefecture as string) ?? "";
  const tradeType = (sp.tradeType as string) ?? "";

  // Build query - fetch users with role='client' joined with client_profiles
  // Use !inner join when filters target client_profiles columns,
  // so PostgREST filters parent rows (not just nested rows)
  const needsInnerJoin = !!prefecture || !!tradeType;
  const profileJoin = needsInnerJoin ? "client_profiles!inner" : "client_profiles";

  let query = supabase
    .from("users")
    .select(
      `
      id, avatar_url, company_name, last_name, first_name, deleted_at, prefecture,
      ${profileJoin}(recruit_job_types, recruit_area, working_way)
    `,
      { count: "exact" },
    )
    .eq("role", "client")
    .is("deleted_at", null);

  // Apply filters
  if (q) {
    query = query.or(
      `company_name.ilike.%${q}%,last_name.ilike.%${q}%,first_name.ilike.%${q}%`,
    );
  }
  if (prefecture) {
    query = query.overlaps("client_profiles.recruit_area", [prefecture]);
  }
  if (tradeType) {
    query = query.overlaps("client_profiles.recruit_job_types", [tradeType]);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data: clients, count } = await query;

  // Get user's favorites for these clients
  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: favorites } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", user.id)
    .eq("target_type", "client")
    .in("target_id", clientIds.length > 0 ? clientIds : ["__none__"]);

  const favoritedIds = new Set((favorites ?? []).map((f) => f.target_id));

  return (
    <div className="min-h-dvh bg-muted">
      {/* Header */}
      <div className="bg-background px-6 py-4 md:px-12">
        <h1 className="text-heading-lg font-bold text-secondary">
          発注者一覧
        </h1>
      </div>

      <div className="px-6 md:px-12">
        {/* Count + Search */}
        <div className="flex items-center justify-between py-4">
          <p className="text-body-sm text-muted-foreground">
            全{count ?? 0}件
          </p>
          <div className="flex items-center gap-2">
            <SearchFilterSheet>
              <form method="get" className="space-y-4">
                <div>
                  <label className="text-body-sm font-medium">キーワード</label>
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="会社名・名前で検索"
                    className="mt-1 w-full rounded-[8px] border border-border px-3 py-2 text-body-sm"
                  />
                </div>
                <div>
                  <label className="text-body-sm font-medium">エリア</label>
                  <input
                    name="prefecture"
                    defaultValue={prefecture}
                    placeholder="都道府県"
                    className="mt-1 w-full rounded-[8px] border border-border px-3 py-2 text-body-sm"
                  />
                </div>
                <div>
                  <label className="text-body-sm font-medium">職種</label>
                  <input
                    name="tradeType"
                    defaultValue={tradeType}
                    placeholder="職種"
                    className="mt-1 w-full rounded-[8px] border border-border px-3 py-2 text-body-sm"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  検索する
                </Button>
              </form>
            </SearchFilterSheet>
          </div>
        </div>

        {/* Client cards grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
          {(clients ?? []).map((client) => {
            const profile = Array.isArray(client.client_profiles)
              ? client.client_profiles[0]
              : client.client_profiles;
            const displayName = getUserDisplayName(
              {
                lastName: client.last_name,
                firstName: client.first_name,
                companyName: client.company_name,
                deletedAt: client.deleted_at,
              },
              "company",
            );

            return (
              <Card key={client.id} className="overflow-hidden rounded-[8px]">
                <CardContent className="p-4 space-y-3">
                  {/* Avatar + Name + Address */}
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
                      {client.prefecture && (
                        <p className="text-body-sm text-muted-foreground">
                          {client.prefecture}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-1.5 text-body-sm">
                    {profile?.recruit_job_types && profile.recruit_job_types.length > 0 && (
                      <div className="flex items-center">
                        <img src="/images/icons/icon-briefcase.png" alt="" className="w-4 h-4 shrink-0" />
                        <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">募集職種</span>
                        <span className="line-clamp-1">
                          {profile.recruit_job_types.join("、")}
                        </span>
                      </div>
                    )}
                    {profile?.recruit_area && profile.recruit_area.length > 0 && (
                      <div className="flex items-center">
                        <img src="/images/icons/icon-pin.png" alt="" className="w-4 h-4 shrink-0" />
                        <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">募集エリア</span>
                        <span className="line-clamp-1">
                          {profile.recruit_area.join("、")}
                        </span>
                      </div>
                    )}
                    {profile?.working_way && (
                      <div className="flex items-center">
                        <CalendarDays className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">求める働き方</span>
                        <span>{profile.working_way}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <FavoriteButton
                      targetType="client"
                      targetId={client.id}
                      initialIsFavorited={favoritedIds.has(client.id)}
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

        {(clients ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-body-md text-muted-foreground">
              条件に一致する発注者が見つかりませんでした。
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
