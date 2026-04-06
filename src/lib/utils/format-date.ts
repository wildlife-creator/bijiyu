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
