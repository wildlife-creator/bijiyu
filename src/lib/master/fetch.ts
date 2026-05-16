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
