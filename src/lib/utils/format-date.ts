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
