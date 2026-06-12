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
