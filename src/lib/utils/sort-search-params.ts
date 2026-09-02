/**
 * 並び替えプルダウン（SortSelect）用の URL クエリ生成。
 *
 * 現在の検索条件（キーワード・エリア・ステータス等）を保持したまま `sort` だけを差し替え、
 * ページ番号は 1 に戻す（`page` を削除）。
 *
 * `?municipality=港区&municipality=渋谷区` のような同名キー繰り返し（配列）も
 * URLSearchParams をそのまま引き継ぐので落ちない（旧 buildSortLinkHref の A9 対策を継承）。
 *
 * @param currentSearch 現在の検索文字列（`useSearchParams().toString()`。先頭の `?` は不要）
 * @param nextSort 切替後の sort 値
 * @param paramName sort パラメータ名（既定 "sort"）
 * @returns `?` を含まない検索文字列
 */
export function buildSortSearch(
  currentSearch: string,
  nextSort: string,
  paramName = "sort",
): string {
  const params = new URLSearchParams(currentSearch);
  params.set(paramName, nextSort);
  params.delete("page");
  return params.toString();
}
