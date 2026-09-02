import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { ContractorSearchFilter } from "./contractor-search-filter";
import { HighRatingBadge } from "@/components/shared/high-rating-badge";
import { fetchBulkOverallSummary } from "@/lib/rating/aggregate";
import { createClient } from "@/lib/supabase/server";
import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
} from "@/lib/master/fetch";
import { buildAreaFilterIds } from "@/lib/utils/area-search-clauses";
import { experienceYearsBounds } from "@/lib/utils/experience-years-filter";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { AreaSummary } from "@/components/area/area-summary";
import type { AreaForDisplay } from "@/lib/utils/format-areas";

// カード3列グリッド。3 と 2 の公倍数にして最終行の欠けを防ぐ（lg=3列 / md=2列）
const ITEMS_PER_PAGE = 18;

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
  // 経験年数フィルタ（範囲ラベル → user_skills.experience_years の数値境界）
  const experienceYears = (sp.experienceYears as string) ?? "";

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

  // join 先テーブルの user_id 集合をページネーションして全件取得する。
  // PostgREST は無指定だと 1000 件で静かに打ち切るため、.range() で全ページ走査する
  // （CLAUDE.md「PostgREST の件数上限とページネーション」/ fetchAllPages 基準）。
  // 途中ページで error が出たら、部分データで誤絞り込みしないようその時点で打ち切る。
  const USER_ID_PAGE_SIZE = 1000;
  async function collectUserIds(
    buildPage: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: { user_id: string }[] | null; error: unknown }>,
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    for (let from = 0; ; from += USER_ID_PAGE_SIZE) {
      const to = from + USER_ID_PAGE_SIZE - 1;
      const { data, error } = await buildPage(from, to);
      if (error || !data) break;
      for (const row of data) ids.add(row.user_id);
      if (data.length < USER_ID_PAGE_SIZE) break;
    }
    return ids;
  }

  // 職種と経験年数を同時指定した場合は「選択した職種での経験年数」で判定する。
  // 職種と無相関の ANY 一致だと「大工2年＋塗装12年」の職人が「大工×10年以上」で
  // ヒットしてしまうため、経験年数フィルタ側の複合クエリ
  // （trade_type IN (選択職種) AND experience_years 範囲）に集約する。
  // 意味論は lib/utils/experience-years-filter.ts の hasMatchingTradeExperience 参照。
  const expBounds = experienceYears
    ? experienceYearsBounds(experienceYears)
    : null;
  const combineTradeIntoExperience = tradeTypes.length > 0 && expBounds !== null;

  const idSets: Array<Set<string>> = [];
  // 職種フィルタ: 経験年数と併用する場合は上記の複合クエリに集約するため、
  // 経験年数の指定が無い場合のみ職種単独で絞り込む。
  if (tradeTypes.length > 0 && !combineTradeIntoExperience) {
    idSets.push(
      await collectUserIds((from, to) =>
        supabase
          .from("user_skills")
          .select("user_id")
          .in("trade_type", tradeTypes)
          .range(from, to),
      ),
    );
  }
  if (qualificationFilters.length > 0) {
    idSets.push(
      await collectUserIds((from, to) =>
        supabase
          .from("user_qualifications")
          .select("user_id")
          .in("qualification_name", qualificationFilters)
          .range(from, to),
      ),
    );
  }
  // 経験年数フィルタ: 職種も指定されていれば trade_type IN (選択職種) AND
  // experience_years 範囲 の複合条件、職種未指定なら経験年数のみ（いずれかの対応職種が
  // 範囲内なら該当）。NULL（未記載）は境界に一致せず除外される。
  if (expBounds) {
    idSets.push(
      await collectUserIds((from, to) => {
        let q = supabase.from("user_skills").select("user_id");
        if (combineTradeIntoExperience) {
          q = q.in("trade_type", tradeTypes);
        }
        if (expBounds.gte !== undefined) {
          q = q.gte("experience_years", expBounds.gte);
        }
        if (expBounds.lt !== undefined) {
          q = q.lt("experience_years", expBounds.lt);
        }
        return q.range(from, to);
      }),
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
    .is("deleted_at", null)
    // 管理運営アカウント（P5）は一覧・検索に出さない
    .eq("is_hidden", false);

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

  // 高評価バッジ用: 総合評価サマリーを1クエリで bulk 取得（N+1 回避）
  const summaryMap = await fetchBulkOverallSummary(supabase, contractorIds);

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">職人一覧</h1>

      <div>
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
                  {/* 高評価バッジ（総合評価3件以上 + ★平均4.0以上で表示） */}
                  <HighRatingBadge
                    summary={summaryMap.get(contractor.id) ?? { avg: null, count: 0 }}
                  />

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
          <EmptyState>条件に一致する職人が見つかりませんでした。</EmptyState>
        )}

        {/* Pagination */}
        <PaginationControls
          totalCount={count ?? 0}
          itemsPerPage={ITEMS_PER_PAGE}
        />

        <BackButton />
      </div>
      </div>
    </div>
  );
}
