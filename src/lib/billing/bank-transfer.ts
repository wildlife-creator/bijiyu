/**
 * 銀行振込の共通定数・暦日ヘルパー。
 * 仕様: docs/requirements/current-spec.md「銀行振込」
 *
 * 銀行振込はアプリ上「プランのオン／オフ」だけを持つ。申込レコード・金額計算・
 * 有効期限・期限バッジは持たない。
 * 契約行は subscriptions / option_subscriptions の payment_method = 'bank_transfer'。
 */

/** 銀行振込契約者が Stripe 前提の操作（変更・解約・支払情報）に触れたときの案内文 */
export const BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE =
  "銀行振込でご契約中のプラン・オプションの変更や解約は、運営までご連絡ください";

/** 料金プラン画面の案内文（お問い合わせへのリンクを添えて表示する） */
export const BANK_TRANSFER_CONTACT_MESSAGE =
  "銀行振込をご希望の方はお問い合わせください";

// ---------------------------------------------------------------------------
// 暦日（YYYY-MM-DD）の計算。timestamptz ではなく date 文字列で扱い、
// 実行環境のタイムゾーンに依存しないよう UTC 基準で計算する。
// 管理運営アカウントの契約付与で使用。
// ---------------------------------------------------------------------------

/**
 * 暦日 → DB 保存用 timestamptz（Asia/Tokyo）。
 * 開始日は 00:00:00 JST、終了日は 23:59:59 JST として保存する。
 */
export function dateStringToJstIso(dateStr: string, edge: "start" | "end"): string {
  const time = edge === "start" ? "00:00:00" : "23:59:59";
  return new Date(`${dateStr}T${time}+09:00`).toISOString();
}

/** timestamptz（ISO）→ JST の暦日文字列（YYYY-MM-DD）。 */
export function isoToJstDateString(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 今日の暦日（JST、YYYY-MM-DD）。テストで差し替えられるよう now を引数化。 */
export function todayJstDateString(now: Date = new Date()): string {
  return isoToJstDateString(now.toISOString());
}
