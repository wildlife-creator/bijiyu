/**
 * Format a message timestamp for display:
 * - Same day: HH:mm
 * - Same year: MM/DD
 * - Different year: YYYY/MM/DD
 *
 * 常に JST(Asia/Tokyo) で評価する。Server Component で動くため、
 * デプロイ先のサーバー TZ(通常 UTC)に依存させない。
 */

const JST = "Asia/Tokyo";

function getJstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function formatMessageTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  const target = getJstParts(new Date(dateStr));
  const today = getJstParts(new Date());

  const isToday =
    target.year === today.year &&
    target.month === today.month &&
    target.day === today.day;

  if (isToday) {
    return `${target.hour}:${target.minute}`;
  }

  if (target.year === today.year) {
    return `${target.month}/${target.day}`;
  }

  return `${target.year}/${target.month}/${target.day}`;
}

/**
 * Format a message bubble timestamp: MM/DD HH:mm (CSS spec format)
 */
export function formatBubbleTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  const p = getJstParts(new Date(dateStr));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}
