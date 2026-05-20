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
import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
} from "@/lib/master/fetch";
import { buildAreaFilterIds } from "@/lib/utils/area-search-clauses";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { AreaSummary } from "@/components/area/area-summary";
import type { AreaForDisplay } from "@/lib/utils/format-areas";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getArrayParam(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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
  // 配列: 同名キー繰り返しで encode された値を getAll 相当で復元
  const municipalities = getArrayParam(sp.municipality);
  const tradeTypes = getArrayParam(sp.tradeType);
  const skillTagFilters = getArrayParam(sp.skillTag);
  const qualificationFilters = getArrayParam(sp.qualification);

  // 3 マスタ + 市区町村マスタ取得 (検索ポップアップへ active label を渡す)
  const [allTrade, allTags, allQuals, candidateMunicipalitiesByPrefecture] =
    await Promise.all([
      getAllMasterRows("trade-types"),
      getAllMasterRows("skill-tags"),
      getAllMasterRows("qualifications"),
      getMunicipalitiesByPrefecture(),
    ]);
  const activeTradeTypes = allTrade
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const activeSkillTags = allTags
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const activeQualifications = allQuals
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);

  // ──────────────────────────────────────────────────────────────────────
  // 受注者として活動しうるユーザー（role IN ('contractor','client')）を対象とする。
  // staff（法人 admin/staff）は受注者アクション不可なので除外。自分自身も除外。
  // 設計理由: ビジ友は「1 アカウントで受注・発注両方 OK」設計。client は元 contractor または個人発注者・小規模・法人 Owner で、
  // 正規ルート（/register/profile）を経た全ユーザーは user_skills/available_areas を必ず持つ（registerProfileSchema が min(1) で必須化）。
  //
  // フィルタ戦略: join 先テーブルの絞り込みは ID リスト方式で事前抽出してから .in("id", ...) する。
  // PostgREST の !inner join だと nested data（カード表示用の全 skills/areas/quals）が削られるため。
  // これにより count と range（ページネーション）がフィルタ適用後の正確な値になる。
  //
  // master-area: prefecture/municipality は buildAreaFilterIds で上位包含ルール適用後の
  // user_id 集合を取得し、ID 集合の積に統合する。
  // ──────────────────────────────────────────────────────────────────────

  async function fetchMatchingUserIds(
    table: "user_skills" | "user_qualifications",
    column: "trade_type" | "qualification_name",
    values: string[],
  ): Promise<Set<string>> {
    const { data } = await supabase
      .from(table)
      .select("user_id")
      .in(column, values);
    return new Set((data ?? []).map((r) => r.user_id));
  }

  const idSets: Array<Set<string>> = [];
  if (tradeTypes.length > 0) {
    idSets.push(
      await fetchMatchingUserIds("user_skills", "trade_type", tradeTypes),
    );
  }
  if (qualificationFilters.length > 0) {
    idSets.push(
      await fetchMatchingUserIds(
        "user_qualifications",
        "qualification_name",
        qualificationFilters,
      ),
    );
  }
  // master-area-multi-select: muni 配列が空なら buildAreaFilterIds 1 回、
  // 複数なら各 muni で呼び Set 和で OR 結合
  const areaUserIds: string[] | null = await (async () => {
    if (!prefecture) return null;
    if (municipalities.length === 0) {
      return buildAreaFilterIds({
        entity: "user",
        prefecture,
        municipality: null,
        supabase,
      });
    }
    const perMuni = await Promise.all(
      municipalities.map((m) =>
        buildAreaFilterIds({
          entity: "user",
          prefecture,
          municipality: m,
          supabase,
        }),
      ),
    );
    const merged = new Set<string>();
    for (const ids of perMuni) {
      if (ids) for (const id of ids) merged.add(id);
    }
    return Array.from(merged);
  })();
  if (areaUserIds !== null) {
    idSets.push(new Set(areaUserIds));
  }

  // 異なるカテゴリは AND → 全 ID 集合の積を取る
  const candidateIds: string[] | null =
    idSets.length === 0
      ? null
      : Array.from(
          idSets.reduce((acc, s) =>
            new Set(Array.from(acc).filter((id) => s.has(id))),
          ),
        );

  let query = supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, birth_date, deleted_at,
      identity_verified, ccus_verified, skill_tags,
      user_skills(trade_type, experience_years)
    `,
      { count: "exact" },
    )
    .in("role", ["contractor", "client"])
    .neq("id", user.id)
    .is("deleted_at", null);

  if (candidateIds !== null) {
    // 0 件確定の場合も .in([]) は危ういのでダミーで空結果を強制
    query = query.in("id", candidateIds.length > 0 ? candidateIds : ["__none__"]);
  }
  if (skillTagFilters.length > 0) {
    // text[] カラムは OR 一致を overlaps (&&) で
    query = query.overlaps("skill_tags", skillTagFilters);
  }
  if (q) {
    query = query.or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%`);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data: contractors, count } = await query;
  const filteredContractors = contractors ?? [];

  // master-area: bulk fetch user_available_areas for card display
  const contractorIds = filteredContractors.map((c) => c.id);
  const userAreasMap = new Map<string, AreaForDisplay[]>();
  if (contractorIds.length > 0) {
    const { data: areaRows } = await supabase
      .from("user_available_areas")
      .select("user_id, prefecture, municipality")
      .in("user_id", contractorIds);
    for (const row of areaRows ?? []) {
      const list = userAreasMap.get(row.user_id) ?? [];
      list.push({ prefecture: row.prefecture, municipality: row.municipality });
      userAreasMap.set(row.user_id, list);
    }
  }

  // Get user's favorites
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
        <h1 className="text-center text-heading-lg font-bold text-secondary">職人一覧</h1>
      </div>

      <div className="px-6 md:px-12">
        {/* Count + Search */}
        <div className="flex items-center justify-between py-4">
          <p className="text-body-sm text-muted-foreground">
            全{count ?? 0}件
          </p>
          <div className="flex items-center gap-2">
            <ContractorSearchFilter
              activeTradeTypes={activeTradeTypes}
              activeSkillTags={activeSkillTags}
              activeQualifications={activeQualifications}
              candidateMunicipalitiesByPrefecture={
                candidateMunicipalitiesByPrefecture
              }
            />
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
            const areas = userAreasMap.get(contractor.id) ?? [];
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
