/**
 * 検索 popup 用の上位包含クエリビルダー。
 *
 * 仕様 (Req 6.1 / 6.2 / 6.5 / 6.6):
 *   - prefecture のみ指定 (municipality = null) → 同県内の全レコード ID を返す
 *     (市区町村未指定・指定済みすべて)
 *   - prefecture + municipality 指定 → 上位包含
 *     `prefecture = ? AND (municipality = ? OR municipality IS NULL)`
 *     (該当市区町村レコード + 同県全域指定レコード)
 *   - prefecture = null → 無絞り込み (null を返し、呼び出し側で .in() スキップ)
 *   - 異なる都道府県のレコードを絶対にヒットさせない (R6 ガード)
 *
 * 戻り値の使い方:
 *   const ids = await buildAreaFilterIds({ entity: "job", prefecture, municipality, supabase });
 *   if (ids !== null) query = query.in("id", ids);
 *
 * 実装方針:
 *   - PostgREST に DISTINCT は無いので Set で app-side dedupe
 *   - 「municipality = ? OR municipality IS NULL」は .or() ではなく
 *     2 query を並列実行 + 結果結合する (.or() の文字列パース対策・municipality
 *     のエスケープ事故防止)
 *   - 旧 post-filter (JS 側 fetch 後絞り込み) パターンは使わない (Req 6.6、
 *     count・ページネーション破綻防止、CLAUDE.md 既存ルール)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type AreaEntity = "job" | "client" | "user";

export interface BuildAreaFilterIdsParams {
  entity: AreaEntity;
  prefecture: string | null;
  municipality: string | null;
  supabase: SupabaseClient<Database>;
}

export async function buildAreaFilterIds(
  params: BuildAreaFilterIdsParams,
): Promise<string[] | null> {
  const { entity, prefecture, municipality, supabase } = params;
  if (!prefecture) return null;

  switch (entity) {
    case "job":
      return await fetchJobIds(supabase, prefecture, municipality);
    case "client":
      return await fetchClientIds(supabase, prefecture, municipality);
    case "user":
      return await fetchUserIds(supabase, prefecture, municipality);
  }
}

async function fetchJobIds(
  supabase: SupabaseClient<Database>,
  prefecture: string,
  municipality: string | null,
): Promise<string[]> {
  if (municipality === null) {
    const { data, error } = await supabase
      .from("job_areas")
      .select("job_id")
      .eq("prefecture", prefecture);
    if (error || !data) return [];
    return Array.from(new Set(data.map((r) => r.job_id)));
  }
  const [exact, fullPref] = await Promise.all([
    supabase
      .from("job_areas")
      .select("job_id")
      .eq("prefecture", prefecture)
      .eq("municipality", municipality),
    supabase
      .from("job_areas")
      .select("job_id")
      .eq("prefecture", prefecture)
      .is("municipality", null),
  ]);
  if (exact.error && fullPref.error) return [];
  const ids = new Set<string>();
  for (const r of exact.data ?? []) ids.add(r.job_id);
  for (const r of fullPref.data ?? []) ids.add(r.job_id);
  return Array.from(ids);
}

async function fetchClientIds(
  supabase: SupabaseClient<Database>,
  prefecture: string,
  municipality: string | null,
): Promise<string[]> {
  if (municipality === null) {
    const { data, error } = await supabase
      .from("client_recruit_areas")
      .select("client_id")
      .eq("prefecture", prefecture);
    if (error || !data) return [];
    return Array.from(new Set(data.map((r) => r.client_id)));
  }
  const [exact, fullPref] = await Promise.all([
    supabase
      .from("client_recruit_areas")
      .select("client_id")
      .eq("prefecture", prefecture)
      .eq("municipality", municipality),
    supabase
      .from("client_recruit_areas")
      .select("client_id")
      .eq("prefecture", prefecture)
      .is("municipality", null),
  ]);
  if (exact.error && fullPref.error) return [];
  const ids = new Set<string>();
  for (const r of exact.data ?? []) ids.add(r.client_id);
  for (const r of fullPref.data ?? []) ids.add(r.client_id);
  return Array.from(ids);
}

async function fetchUserIds(
  supabase: SupabaseClient<Database>,
  prefecture: string,
  municipality: string | null,
): Promise<string[]> {
  if (municipality === null) {
    const { data, error } = await supabase
      .from("user_available_areas")
      .select("user_id")
      .eq("prefecture", prefecture);
    if (error || !data) return [];
    return Array.from(new Set(data.map((r) => r.user_id)));
  }
  const [exact, fullPref] = await Promise.all([
    supabase
      .from("user_available_areas")
      .select("user_id")
      .eq("prefecture", prefecture)
      .eq("municipality", municipality),
    supabase
      .from("user_available_areas")
      .select("user_id")
      .eq("prefecture", prefecture)
      .is("municipality", null),
  ]);
  if (exact.error && fullPref.error) return [];
  const ids = new Set<string>();
  for (const r of exact.data ?? []) ids.add(r.user_id);
  for (const r of fullPref.data ?? []) ids.add(r.user_id);
  return Array.from(ids);
}
