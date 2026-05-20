import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { EMPLOYEE_SCALE_RANGES } from "@/lib/constants/options";
import { createClient } from "@/lib/supabase/server";
import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
} from "@/lib/master/fetch";
import { buildAreaFilterIds } from "@/lib/utils/area-search-clauses";
import { SummaryWithOthers } from "@/components/master/summary-with-others";
import { AreaSummary } from "@/components/area/area-summary";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { resolveParticipantName } from "@/lib/utils/display-name";

import { ClientSearchForm } from "./client-search-form";

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
  // 同名キー繰返し形式 (?municipality=A&municipality=B) を配列に復元
  const municipalities: string[] = !sp.municipality
    ? []
    : Array.isArray(sp.municipality)
      ? sp.municipality
      : [sp.municipality];
  const tradeTypes = !sp.tradeType
    ? []
    : Array.isArray(sp.tradeType)
      ? sp.tradeType
      : [sp.tradeType];

  // 検索ポップアップに渡す active 募集職種マスタ + 市区町村マスタ
  const [allTradeTypes, candidateMunicipalitiesByPrefecture] = await Promise.all([
    getAllMasterRows("trade-types"),
    getMunicipalitiesByPrefecture(),
  ]);
  const activeTradeTypes = allTradeTypes
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const employeeScaleLabel = (sp.employeeScale as string) ?? "";
  const workingWay = (sp.workingWay as string) ?? "";
  const language = (sp.language as string) ?? "";

  const employeeScaleRange = employeeScaleLabel
    ? EMPLOYEE_SCALE_RANGES.find((r) => r.label === employeeScaleLabel) ?? null
    : null;

  // キーワード検索は users.last_name / first_name と client_profiles.display_name の
  // OR 検索だが、Supabase JS の .or() は foreign relation の参照を安定して扱えない
  // ため、2 段階クエリで user_id 集合を先に解決してから本クエリで .in() で絞り込む。
  let keywordUserIds: string[] | null = null;
  if (q) {
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;
    const [namesRes, profilesRes] = await Promise.all([
      supabase
        .from("users")
        .select("id")
        .eq("role", "client")
        .is("deleted_at", null)
        .or(`last_name.ilike.${pattern},first_name.ilike.${pattern}`),
      supabase
        .from("client_profiles")
        .select("user_id")
        .ilike("display_name", pattern),
    ]);
    const idSet = new Set<string>();
    (namesRes.data ?? []).forEach((r) => idSet.add(r.id));
    (profilesRes.data ?? []).forEach((r) => {
      if (r.user_id) idSet.add(r.user_id);
    });
    keywordUserIds = Array.from(idSet);
  }

  // master-area-multi-select: prefecture/municipality[] 階層フィルタ。
  // muni 配列が空: buildAreaFilterIds を 1 回。複数: 各 muni で呼び Set 和 OR 結合。
  const areaClientIds: string[] | null = await (async () => {
    if (!prefecture) return null;
    if (municipalities.length === 0) {
      return buildAreaFilterIds({
        entity: "client",
        prefecture,
        municipality: null,
        supabase,
      });
    }
    const perMuni = await Promise.all(
      municipalities.map((m) =>
        buildAreaFilterIds({
          entity: "client",
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

  // Build query - fetch users with role='client' joined with client_profiles
  // Use !inner join when filters target client_profiles columns,
  // so PostgREST filters parent rows (not just nested rows)
  const needsInnerJoin =
    tradeTypes.length > 0 ||
    !!employeeScaleRange ||
    !!workingWay ||
    !!language;
  const profileJoin = needsInnerJoin ? "client_profiles!inner" : "client_profiles";

  let query = supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, deleted_at, prefecture,
      ${profileJoin}(display_name, image_url, recruit_job_types, working_way, employee_scale)
    `,
      { count: "exact" },
    )
    .eq("role", "client")
    .is("deleted_at", null);

  // Apply filters
  if (keywordUserIds !== null) {
    // 0件の場合も適切に 0 件返すよう、ダミー UUID で確実に空にする
    query = query.in(
      "id",
      keywordUserIds.length > 0
        ? keywordUserIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  if (areaClientIds !== null) {
    query = query.in(
      "id",
      areaClientIds.length > 0
        ? areaClientIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  if (tradeTypes.length > 0) {
    query = query.overlaps("client_profiles.recruit_job_types", tradeTypes);
  }
  if (employeeScaleRange) {
    query = query.gte("client_profiles.employee_scale", employeeScaleRange.min);
    if (employeeScaleRange.max !== null) {
      query = query.lte("client_profiles.employee_scale", employeeScaleRange.max);
    }
  }
  if (workingWay) {
    query = query.overlaps("client_profiles.working_way", [workingWay]);
  }
  if (language) {
    query = query.overlaps("client_profiles.language", [language]);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data: clients, count } = await query;

  // Get user's favorites for these clients
  const clientIds = (clients ?? []).map((c) => c.id);

  // Bulk fetch client_recruit_areas for cards
  const clientAreasMap = new Map<string, AreaForDisplay[]>();
  if (clientIds.length > 0) {
    const { data: areaRows } = await supabase
      .from("client_recruit_areas")
      .select("client_id, prefecture, municipality")
      .in("client_id", clientIds);
    for (const row of areaRows ?? []) {
      const list = clientAreasMap.get(row.client_id) ?? [];
      list.push({ prefecture: row.prefecture, municipality: row.municipality });
      clientAreasMap.set(row.client_id, list);
    }
  }

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
        <h1 className="text-center text-heading-lg font-bold text-secondary">
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
            <ClientSearchForm
              activeTradeTypes={activeTradeTypes}
              candidateMunicipalitiesByPrefecture={
                candidateMunicipalitiesByPrefecture
              }
            />
          </div>
        </div>

        {/* Client cards grid */}
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
            // 発注者アバターは client_profiles.image_url を優先し、未設定なら users.avatar_url
            const avatarUrl = profile?.image_url ?? client.avatar_url;
            const clientAreas = clientAreasMap.get(client.id) ?? [];

            return (
              <Card key={client.id} className="overflow-hidden rounded-[8px]">
                <CardContent className="p-4 space-y-3">
                  {/* Avatar + Name + Address */}
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
                          <SummaryWithOthers
                            items={profile.recruit_job_types}
                            maxVisible={2}
                          />
                        </span>
                      </div>
                    )}
                    <div className="flex items-center">
                      <img src="/images/icons/icon-pin.png" alt="" className="w-4 h-4 shrink-0" />
                      <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">募集エリア</span>
                      <AreaSummary areas={clientAreas} className="line-clamp-1" />
                    </div>
                    {profile?.working_way && profile.working_way.length > 0 && (
                      <div className="flex items-center">
                        <CalendarDays className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="ml-1.5 w-[5.5rem] shrink-0 text-muted-foreground">求める働き方</span>
                        <span className="line-clamp-1">{profile.working_way.join("、")}</span>
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
