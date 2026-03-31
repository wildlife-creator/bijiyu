import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { ContractorSearchFilter } from "./contractor-search-filter";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContractorListPage({ searchParams }: PageProps) {
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

  // Build query - fetch users with role='contractor'
  let query = supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, birth_date, deleted_at,
      identity_verified, ccus_verified,
      user_skills(trade_type, experience_years),
      user_available_areas(prefecture)
    `,
      { count: "exact" },
    )
    .eq("role", "contractor")
    .is("deleted_at", null);

  // Apply keyword filter
  if (q) {
    query = query.or(
      `last_name.ilike.%${q}%,first_name.ilike.%${q}%`,
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data: contractors, count } = await query;

  // Post-filter by prefecture and tradeType (joined table filters)
  let filteredContractors = contractors ?? [];
  if (prefecture) {
    filteredContractors = filteredContractors.filter((c) => {
      const areas = (c.user_available_areas as Array<{ prefecture: string }>) ?? [];
      return areas.some((a) => a.prefecture === prefecture);
    });
  }
  if (tradeType) {
    filteredContractors = filteredContractors.filter((c) => {
      const skills = (c.user_skills as Array<{ trade_type: string }>) ?? [];
      return skills.some((s) => s.trade_type === tradeType);
    });
  }

  // Get user's favorites
  const contractorIds = filteredContractors.map((c) => c.id);
  const { data: favorites } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", user.id)
    .eq("target_type", "user")
    .in("target_id", contractorIds.length > 0 ? contractorIds : ["__none__"]);

  const favoritedIds = new Set((favorites ?? []).map((f) => f.target_id));

  return (
    <div className="min-h-dvh bg-muted">
      {/* Header */}
      <div className="bg-background px-6 py-4 md:px-12">
        <h1 className="text-heading-lg font-bold text-secondary">職人一覧</h1>
      </div>

      <div className="px-6 md:px-12">
        {/* Count + Search */}
        <div className="flex items-center justify-between py-4">
          <p className="text-body-sm text-muted-foreground">
            全{count ?? 0}件
          </p>
          <div className="flex items-center gap-2">
            <ContractorSearchFilter />
          </div>
        </div>

        {/* Contractor cards grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
          {filteredContractors.map((contractor) => {
            const displayName = getUserDisplayName({
              lastName: contractor.last_name,
              firstName: contractor.first_name,
              deletedAt: contractor.deleted_at,
            });
            const skills = (contractor.user_skills as Array<{
              trade_type: string;
              experience_years: number | null;
            }>) ?? [];
            const areas = (contractor.user_available_areas as Array<{
              prefecture: string;
            }>) ?? [];
            const age = contractor.birth_date
              ? calculateAge(contractor.birth_date)
              : null;

            return (
              <Card
                key={contractor.id}
                className="overflow-hidden rounded-[8px]"
              >
                <CardContent className="p-4 space-y-3">
                  {/* High rating badge (placeholder — real logic uses reviews) */}
                  <div className="flex items-center gap-2">
                    <Badge className="rounded-sm bg-foreground text-background text-[10px] px-1.5 py-0.5">
                      高評価
                    </Badge>
                    <span className="text-body-sm text-muted-foreground">
                      発注者の再発注希望80%！
                    </span>
                  </div>

                  {/* Avatar + Name + Age + Skills */}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-muted overflow-hidden">
                      {contractor.avatar_url ? (
                        <img
                          src={contractor.avatar_url}
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
                        <p className="text-body-sm text-muted-foreground line-clamp-1 mt-0.5">
                          {skills.map((s) => s.trade_type).join("、")}
                        </p>
                      )}
                      {/* Verification badges */}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {contractor.identity_verified && (
                          <span className="flex items-center gap-1 text-[11px]">
                            <img
                              src="/images/icons/icon-tag.png"
                              alt=""
                              className="w-3.5 h-3.5"
                            />
                            本人確認済み
                          </span>
                        )}
                        {contractor.ccus_verified && (
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

                  {/* Info rows */}
                  <div className="space-y-1.5 text-body-sm">
                    {areas.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <img src="/images/icons/icon-pin.png" alt="" className="w-4 h-4 shrink-0" />
                        <span className="text-muted-foreground">対応エリア</span>
                        <span className="line-clamp-1">
                          {areas.map((a) => a.prefecture).join("、")}
                        </span>
                      </div>
                    )}
                    {skills.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="text-muted-foreground">経験年数</span>
                        <span className="line-clamp-1">
                          {skills
                            .filter((s) => s.experience_years)
                            .map((s) => `${s.trade_type} ${s.experience_years}年`)
                            .join("、") || "—"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <FavoriteButton
                      targetType="user"
                      targetId={contractor.id}
                      initialIsFavorited={favoritedIds.has(contractor.id)}
                      variant="text"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="rounded-[47px] border-primary text-primary hover:bg-primary/10"
                    >
                      <Link href={`/users/contractors/${contractor.id}`}>
                        詳細をみる
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredContractors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-body-md text-muted-foreground">
              条件に一致する職人が見つかりませんでした。
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
