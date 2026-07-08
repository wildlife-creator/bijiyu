/**
 * A9 (R5.3): searchParams 全体を維持したまま `sort` だけを切り替える href を生成する。
 *
 * URL の searchParams は `?municipality=港区&municipality=渋谷区` のように
 * 同名キーの繰り返しで配列を表現する。Next.js の searchParams はこれを
 * `{ municipality: ["港区", "渋谷区"] }` の配列で渡してくる。
 *
 * このヘルパーは配列値を `URLSearchParams.append` で 1 件ずつ復元することで
 * ソート切替リンクでもフィルタが落ちないようにする。
 *
 * @param basePath 現在ページのパス (例: "/jobs/search")
 * @param sp Next.js RSC の searchParams (string | string[] | undefined)
 * @param nextSort 切替後の sort 値
 */
export function buildSortLinkHref(
  basePath: string,
  sp: Record<string, string | string[] | undefined>,
  nextSort: string,
): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (key === "sort") continue;
    if (typeof val === "string") {
      params.append(key, val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") params.append(key, item);
      }
    }
  }
  params.set("sort", nextSort);
  return `${basePath}?${params.toString()}`;
}
