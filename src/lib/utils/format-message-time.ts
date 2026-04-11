/**
 * Format a message timestamp for display:
 * - Same day: HH:mm
 * - Same year: MM/DD
 * - Different year: YYYY/MM/DD
 */
export function formatMessageTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  const isSameYear = date.getFullYear() === now.getFullYear();

  if (isSameYear) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Format a message bubble timestamp: MM/DD HH:mm (CSS spec format)
 */
export function formatBubbleTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}/${day} ${hours}:${minutes}`;
}
