/**
 * Format a date string from YYYY-MM-DD to YYYY/MM/DD.
 * Returns fallback ("—") when the input is null/undefined/empty.
 */
export function formatDate(
  dateStr: string | null | undefined,
  fallback = "—"
): string {
  if (!dateStr) return fallback;
  return dateStr.replace(/-/g, "/");
}

/**
 * Today's date in JST as "YYYY-MM-DD".
 * 本番サーバーは UTC のため、明示しないと日付判定が最大9時間ズレる。
 * applications.first_work_date（date 型）との文字列比較に使う
 * （admin 8分類 / canAdminCancel の当日判定で統一）。
 * @param now テスト用の基準時刻（省略時は現在時刻）
 */
export function getJstToday(now: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/**
 * Format an ISO datetime string to "YYYY/MM/DD HH:mm" in Asia/Tokyo.
 * The timezone is explicit because production servers run in UTC —
 * without it every admin screen would display times 9 hours off.
 * Returns fallback ("—") when the input is null/undefined/invalid.
 */
export function formatDateTime(
  iso: string | null | undefined,
  fallback = "—"
): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * "YYYY-MM-DD" に日数を加算して "YYYY-MM-DD" で返す。
 * date 型カラム（時刻・タイムゾーンを持たない暦日）の境界計算に使う純粋関数。
 * UTC 基準で計算するため実行環境のタイムゾーンに依存せず、月またぎも正しく処理する
 * （例: addDaysToDateString("2026-07-29", 5) === "2026-08-03"）。
 * 不正な入力の場合は元の文字列をそのまま返す。
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  const base = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
