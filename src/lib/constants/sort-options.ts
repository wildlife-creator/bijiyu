/**
 * 一覧画面の並び替え定義（P6 一覧改修、spec-changes-202608 §2.5(2)）。
 *
 * 各画面の選択肢（値・ラベル）と既定値をここに集約する。
 * - 先頭の要素が既定値。URL の `?sort=` に無い / 未知の値はサーバー側で既定に倒す（resolveSortValue）
 * - 値は URL に露出するため、既存のブックマーク互換で従来の値（asc / desc / reward_high 等）をそのまま使う
 * - UI は共通の <SortSelect options={...} />（src/components/shared/sort-select.tsx）
 */

export interface SortOption {
  value: string;
  label: string;
}

/** CON-002 案件検索: おすすめ順（急募 → ハイエンド → プレミアム → 新着）が既定 */
export const JOB_SEARCH_SORT_OPTIONS = [
  { value: "recommended", label: "おすすめ順" },
  { value: "newest", label: "新着順" },
  { value: "reward_high", label: "報酬が高い順" },
  { value: "reward_low", label: "報酬が低い順" },
] as const satisfies readonly SortOption[];

/** CON-005 発注者一覧: おすすめ順（ハイエンド → プレミアム → その他、各グループ内は新着順）が既定 */
export const CLIENT_LIST_SORT_OPTIONS = [
  { value: "recommended", label: "おすすめ順" },
  { value: "newest", label: "新着順" },
] as const satisfies readonly SortOption[];

/** CLI-005 職人一覧 */
export const CONTRACTOR_LIST_SORT_OPTIONS = [
  { value: "newest", label: "新着順" },
  { value: "oldest", label: "登録が古い順" },
] as const satisfies readonly SortOption[];

/** CON-007 マイリスト（案件タブ）: 応募締め切り順 */
export const FAVORITE_JOB_SORT_OPTIONS = [
  { value: "asc", label: "応募締め切りが近い順" },
  { value: "desc", label: "応募締め切りが遠い順" },
] as const satisfies readonly SortOption[];

/** CON-011 応募履歴 / CLI-007 応募一覧 / CLI-010 発注履歴 / CLI-007B 案件応募者一覧 */
export const APPLICATION_SORT_OPTIONS = [
  { value: "desc", label: "新しい順" },
  { value: "asc", label: "古い順" },
] as const satisfies readonly SortOption[];

/** CLI-001 募集現場一覧 */
export const JOB_MANAGE_SORT_OPTIONS = [
  { value: "newest", label: "新着順" },
  { value: "oldest", label: "古い順" },
] as const satisfies readonly SortOption[];

export type SortValueOf<T extends readonly SortOption[]> = T[number]["value"];

/**
 * URL の `?sort=` 値を選択肢に照合し、無い / 未知 / 配列の場合は既定（先頭）に倒す。
 * サーバー（page.tsx）とクライアント（SortSelect の現在値）で同じ判定を使う。
 */
export function resolveSortValue<T extends readonly SortOption[]>(
  options: T,
  raw: string | string[] | undefined | null,
): SortValueOf<T> {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const matched = options.find((o) => o.value === candidate);
  return (matched ?? options[0]).value as SortValueOf<T>;
}
