/**
 * 3 マスタ（trade-types / qualifications / skill-tags）の取得 + キャッシュ層。
 *
 * - サーバキャッシュ: `unstable_cache` で 1 時間キャッシュ。tag は
 *   全マスタ共通 `'master-skills'` にし、将来 admin 画面で
 *   `revalidateTag('master-skills')` を呼べば一括で無効化できる
 * - 廃止 (`deprecated_at IS NOT NULL`) は `getActiveXxx` から除外する。
 *   廃止判定の付与には `getAllMasterRows(kind)` を別キーで提供する
 * - 取得失敗時は空配列にフォールバックし、UI 側で「候補を取得できませんでした」
 *   表示を可能にする
 * - 内部では cookieless な anon client のみを使う。`createServerClient` は
 *   呼ばない（unstable_cache 内で cookies() 参照すると throw）
 */
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";

export type MasterKind = "trade-types" | "qualifications" | "skill-tags";

export interface MasterRow {
  label: string;
  deprecated_at: string | null;
}

const TABLE_BY_KIND = {
  "trade-types": "master_trade_types",
  qualifications: "master_qualifications",
  "skill-tags": "master_skill_tags",
} as const satisfies Record<MasterKind, string>;

async function fetchActive(kind: MasterKind): Promise<string[]> {
  try {
    const client = createAnonClient();
    const { data, error } = await client
      .from(TABLE_BY_KIND[kind])
      .select("label")
      .is("deprecated_at", null)
      .order("label", { ascending: true });
    if (error || !data) return [];
    return data.map((row) => row.label);
  } catch {
    return [];
  }
}

async function fetchAll(kind: MasterKind): Promise<MasterRow[]> {
  try {
    const client = createAnonClient();
    const { data, error } = await client
      .from(TABLE_BY_KIND[kind])
      .select("label, deprecated_at")
      .order("label", { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export const getActiveTradeTypes = unstable_cache(
  () => fetchActive("trade-types"),
  ["master-skills", "trade-types", "active"],
  { revalidate: 3600, tags: ["master-skills"] },
);

export const getActiveQualifications = unstable_cache(
  () => fetchActive("qualifications"),
  ["master-skills", "qualifications", "active"],
  { revalidate: 3600, tags: ["master-skills"] },
);

export const getActiveSkillTags = unstable_cache(
  () => fetchActive("skill-tags"),
  ["master-skills", "skill-tags", "active"],
  { revalidate: 3600, tags: ["master-skills"] },
);

const allFetchers: Record<MasterKind, () => Promise<MasterRow[]>> = {
  "trade-types": unstable_cache(
    () => fetchAll("trade-types"),
    ["master-skills", "trade-types", "all"],
    { revalidate: 3600, tags: ["master-skills"] },
  ),
  qualifications: unstable_cache(
    () => fetchAll("qualifications"),
    ["master-skills", "qualifications", "all"],
    { revalidate: 3600, tags: ["master-skills"] },
  ),
  "skill-tags": unstable_cache(
    () => fetchAll("skill-tags"),
    ["master-skills", "skill-tags", "all"],
    { revalidate: 3600, tags: ["master-skills"] },
  ),
};

export function getAllMasterRows(kind: MasterKind): Promise<MasterRow[]> {
  return allFetchers[kind]();
}

// ---------------------------------------------------------------------------
// master-area (市区町村マスタ)
//
// master-skills と独立した 'master-area' キャッシュタグで管理する。
// マスタ更新 SQL マイグレーション後はアプリ側で revalidateTag('master-area')
// を呼び出してキャッシュ無効化する (dev 環境は `.next/dev/cache/fetch-cache`
// 削除も必要、CLAUDE.md 既存ルール)。
// ---------------------------------------------------------------------------

export interface MunicipalityPair {
  prefecture: string;
  municipality: string;
}

export interface MunicipalityRow {
  prefecture: string;
  municipality: string;
  deprecated_at: string | null;
}

async function fetchActiveMunicipalities(): Promise<MunicipalityPair[]> {
  try {
    const client = createAnonClient();
    const { data, error } = await client
      .from("master_municipalities")
      .select("prefecture, municipality")
      .is("deprecated_at", null)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
      prefecture: row.prefecture,
      municipality: row.municipality,
    }));
  } catch {
    return [];
  }
}

async function fetchAllMunicipalityRows(): Promise<MunicipalityRow[]> {
  try {
    const client = createAnonClient();
    const { data, error } = await client
      .from("master_municipalities")
      .select("prefecture, municipality, deprecated_at")
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * active な (prefecture, municipality) ペアを sort_order 昇順で全件返す。
 * 戻り値は 1,897 件で 60 KB 程度 (gzip 数 KB)、1 時間キャッシュで負荷無視可能。
 */
export const getActiveMunicipalities = unstable_cache(
  () => fetchActiveMunicipalities(),
  ["master-area", "municipalities", "active"],
  { revalidate: 3600, tags: ["master-area"] },
);

/**
 * 都道府県別の market 市区町村リスト (in-memory フィルタの薄ラッパー)。
 * 1 都道府県分だけ欲しい呼び出し元向け。検索 popup 等で使用。
 * 内部は getActiveMunicipalities() のキャッシュを共有するため追加 fetch なし。
 */
export async function getActiveMunicipalitiesByPrefecture(
  prefecture: string,
): Promise<string[]> {
  const all = await getActiveMunicipalities();
  return all
    .filter((row) => row.prefecture === prefecture)
    .map((row) => row.municipality);
}

/**
 * deprecated を含む全行 (廃止判定用)。
 * validate-area の validateAreaChanges から使われる。
 */
export const getAllMunicipalityRows = unstable_cache(
  () => fetchAllMunicipalityRows(),
  ["master-area", "municipalities", "all"],
  { revalidate: 3600, tags: ["master-area"] },
);

/**
 * 都道府県 → 市区町村[] の Map を一括で返す。
 * AreaPicker / AreaListEditor の `municipalitiesByPrefecture` props に渡す用途。
 * Server Component で呼び、JSON シリアライズで Client Component に注入する。
 */
export async function getMunicipalitiesByPrefecture(): Promise<
  Record<string, string[]>
> {
  const all = await getActiveMunicipalities();
  const result: Record<string, string[]> = {};
  for (const row of all) {
    if (!result[row.prefecture]) result[row.prefecture] = [];
    result[row.prefecture].push(row.municipality);
  }
  return result;
}
