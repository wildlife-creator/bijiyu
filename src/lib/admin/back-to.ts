/**
 * admin 配下の戻り先導線（backTo クエリ）の解決と伝播ヘルパー。
 *
 * 設計:
 * - 各ページの「もどる」は `resolveBackTo(sp.backTo)` で読み、無ければデフォルト値を使う
 * - 深い遷移へリンクするときは `buildBackToValue(currentPath, backTo)` で
 *   「自分の URL + 自分の backTo」を組み立て、リンク先の `backTo` クエリに渡す
 * - 公開リダイレクター悪用防止のため `/admin/` 始まりのみ受け入れる
 */

/**
 * searchParams 中の backTo を検証して返す。
 * 無効/未指定なら null（呼び出し側でデフォルトを当てる）。
 */
export function resolveBackTo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/admin/")) return null;
  return raw;
}

/**
 * 現在ページから深い遷移へリンクする際の、リンク先 `backTo` 値を組み立てる。
 * - currentBackTo が無い: 自分の path だけ
 * - currentBackTo がある: 自分の path に `?backTo=<encoded(currentBackTo)>` を付ける
 *
 * 注意: 返り値はそのまま URL の `backTo` クエリの value として使う。
 *       リンク先側で `encodeURIComponent` する必要がある（二重エンコード対策）。
 */
export function buildBackToValue(
  currentPath: string,
  currentBackTo: string | null,
): string {
  return currentBackTo
    ? `${currentPath}?backTo=${encodeURIComponent(currentBackTo)}`
    : currentPath;
}
