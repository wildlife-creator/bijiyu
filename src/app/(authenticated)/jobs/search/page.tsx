import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
} from "@/lib/master/fetch";
import { buildAreaFilterIds } from "@/lib/utils/area-search-clauses";
import {
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { JobListCard } from "@/components/job-search/job-list-card";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { JobSearchFilter } from "./job-search-filter";
import type { AreaForDisplay } from "@/lib/utils/format-areas";

const ITEMS_PER_PAGE = 20;

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function resolveWorkPeriodRange(
  preset: string,
): { gte: string; lte?: string } | null {
  if (!preset) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDate(today);
  const addDays = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  };
  switch (preset) {
    case "1週間以内":
      return { gte: todayStr, lte: addDays(7) };
    case "2週間以内":
      return { gte: todayStr, lte: addDays(14) };
    case "1ヶ月以内":
      return { gte: todayStr, lte: addDays(30) };
    case "2ヶ月以内":
      return { gte: todayStr, lte: addDays(60) };
    case "3ヶ月以上先":
      return { gte: addDays(90) };
    default:
      return null;
  }
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobSearchPage({ searchParams }: PageProps) {
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
  const municipality = (sp.municipality as string) ?? "";
  const tradeTypes = !sp.tradeType
    ? []
    : Array.isArray(sp.tradeType)
      ? sp.tradeType
      : [sp.tradeType];

  // 検索ポップアップに渡す active 募集職種マスタ + 市区町村マスタ
  const [allTradeTypes, municipalitiesByPrefecture] = await Promise.all([
    getAllMasterRows("trade-types"),
    getMunicipalitiesByPrefecture(),
  ]);
  const activeTradeTypes = allTradeTypes
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);

  const workPeriod = (sp.workPeriod as string) ?? "";
  const experienceYears = (sp.experienceYears as string) ?? "";
  const language = (sp.language as string) ?? "";
  const sort = (sp.sort as string) ?? "newest";

  // 「希望日程」プリセット → work_start_date の日付レンジに変換（累積判定）
  const workPeriodRange = resolveWorkPeriodRange(workPeriod);

  // 発注者名検索の事前準備:
  //   キーワード（q）が `client_profiles.display_name` に部分一致する
  //   user_ids と、その user_ids が Owner となっている organization_ids を抽出。
  //   後段の jobs クエリで OR 句に IN 条件として加え、案件タイトル/詳細だけでなく
  //   発注者名でもヒットさせる。デザインカンプの「キーワード（タイトル・発注者名）」
  //   ラベルが正しく機能するための実装。
  //   - 個人発注者（organization_id IS NULL）: jobs.owner_id でマッチ
  //   - 法人プラン（organization_id IS NOT NULL）: jobs.organization_id でマッチ
  //     （案件作成者が Staff/Admin で owner_id が Owner と異なるケースもカバー）
  let matchingClientUserIds: string[] = [];
  let matchingClientOrgIds: string[] = [];
  if (q) {
    const { data: matchingProfiles } = await supabase
      .from("client_profiles")
      .select("user_id")
      .ilike("display_name", `%${q}%`);
    matchingClientUserIds = (matchingProfiles ?? []).map((p) => p.user_id);

    if (matchingClientUserIds.length > 0) {
      const { data: matchingOrgs } = await supabase
        .from("organizations")
        .select("id")
        .in("owner_id", matchingClientUserIds)
        .is("deleted_at", null);
      matchingClientOrgIds = (matchingOrgs ?? []).map((o) => o.id);
    }
  }

  // master-area: prefecture/municipality 階層フィルタ。
  // buildAreaFilterIds は上位包含ルール（県のみ指定なら同県全域 + 市区町村指定済みすべて、
  // 県+市指定なら該当市区町村レコード + 同県全域指定レコード）で job_id 集合を返す。
  const areaIds = await buildAreaFilterIds({
    entity: "job",
    prefecture: prefecture || null,
    municipality: municipality || null,
    supabase,
  });

  // Build query
  let query = supabase
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
      { count: "exact" },
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .gte("recruit_end_date", new Date().toISOString().split("T")[0]);

  // Apply filters: title / description / 発注者名（client_profiles.display_name 経由）
  // の3軸で OR 検索。発注者名は事前抽出した owner_id / organization_id への IN
  // 条件として OR 句に加える。
  if (q) {
    const orParts = [
      `title.ilike.%${q}%`,
      `description.ilike.%${q}%`,
    ];
    if (matchingClientUserIds.length > 0) {
      orParts.push(`owner_id.in.(${matchingClientUserIds.join(",")})`);
    }
    if (matchingClientOrgIds.length > 0) {
      orParts.push(`organization_id.in.(${matchingClientOrgIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }
  if (areaIds !== null) {
    // 0 件確定の場合はダミー UUID で空結果を強制（buildAreaFilterIds が空配列を返した場合）
    query = query.in(
      "id",
      areaIds.length > 0 ? areaIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  if (tradeTypes.length > 0) {
    query = query.overlaps("trade_types", tradeTypes);
  }
  if (experienceYears) {
    query = query.eq("experience_years", experienceYears);
  }
  if (language) {
    // text[] カラムへの絞り込みは && 演算子（overlaps）で行う
    query = query.overlaps("language", [language]);
  }
  if (workPeriodRange) {
    query = query.gte("work_start_date", workPeriodRange.gte);
    if (workPeriodRange.lte) {
      query = query.lte("work_start_date", workPeriodRange.lte);
    }
  }

  // Apply sort
  if (sort === "reward_high") {
    query = query.order("reward_upper", { ascending: false, nullsFirst: false });
  } else if (sort === "reward_low") {
    query = query.order("reward_lower", { ascending: true, nullsFirst: false });
  } else {
    // Default: urgent first, then newest
    query = query
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data: jobs, count } = await query;

  const jobIds = (jobs ?? []).map((j) => j.id);

  // Bulk fetch job_areas for cards
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

  // Get user's favorites for these jobs
  const { data: favorites } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", user.id)
    .eq("target_type", "job")
    .in("target_id", jobIds.length > 0 ? jobIds : ["__none__"]);

  const favoritedIds = new Set((favorites ?? []).map((f) => f.target_id));

  return (
    <div className="min-h-dvh bg-muted">
      {/* Header */}
      <div className="bg-background px-6 py-4 md:px-12">
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          募集案件一覧
        </h1>
      </div>

      <div className="px-6 md:px-12">
        {/* Count + Sort + Search */}
        <div className="flex items-center justify-between py-4">
          <p className="text-body-sm text-muted-foreground">
            全{count ?? 0}件
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/jobs/search?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][],
                ),
                sort: sort === "newest" ? "reward_high" : sort === "reward_high" ? "reward_low" : "newest",
              }).toString()}`}
              className="flex items-center gap-1 text-body-sm text-foreground"
            >
              <img
                src="/images/icons/icon-sort.png"
                alt="ソート"
                className="w-5 h-5"
              />
              <span>
                {sort === "reward_high"
                  ? "報酬高い順"
                  : sort === "reward_low"
                    ? "報酬低い順"
                    : "新着順"}
              </span>
            </Link>
            <JobSearchFilter
              activeTradeTypes={activeTradeTypes}
              municipalitiesByPrefecture={municipalitiesByPrefecture}
            />
          </div>
        </div>

        {/* Job cards grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
          {(jobs ?? []).map((job) => {
            const resolution = resolveClientProfileForRow(job);
            const companyName = resolveParticipantName({
              displayName: resolution.displayName,
              lastName: resolution.lastName,
              firstName: resolution.firstName,
              deletedAt: resolution.deletedAt,
            });
            const images = (job.job_images as Array<{
              image_url: string;
              sort_order: number;
            }>) ?? [];
            const thumbnail =
              images.sort((a, b) => a.sort_order - b.sort_order)[0]
                ?.image_url ?? null;

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
                isFavorited={favoritedIds.has(job.id)}
              />
            );
          })}
        </div>

        {(jobs ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-body-md text-muted-foreground">
              条件に一致する案件が見つかりませんでした。
            </p>
          </div>
        )}

        {/* Pagination */}
        <PaginationControls totalCount={count ?? 0} itemsPerPage={ITEMS_PER_PAGE} />

        <BackButton />
      </div>
    </div>
  );
}
