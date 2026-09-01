import {
  OPTION_LABELS,
  OPTION_PRICES_TAX_INCLUDED,
  isSubscriptionOption,
  type OptionType,
} from "@/lib/billing/options";
import {
  BILLING_CYCLE_LABELS,
  INITIAL_FEE_TAX_INCLUDED,
  PLAN_LABELS,
  planPriceFor,
  type BillingCycle,
  type PaidPlanType,
} from "@/lib/constants/plans";

/**
 * 銀行振込（P2）の純粋ロジック。DB・Stripe に依存しない計算とラベルだけを置く。
 * 仕様: docs/requirements/spec-changes-202608.md §2.1(1) / D1 / D3 / D6 / D8
 *
 * - 申込レコード（bank_transfer_requests）の状態: requested → invoiced → paid / cancelled
 * - 有効期限は「開始日 + 1 か月（年払いは + 1 年）の前日」。月末は月末に丸める
 * - 期限が来ても自動停止しない（D3）。管理画面で「期限間近 / 期限切れ」バッジ表示 +
 *   30 日前・当日に運営宛通知
 */

export type BankTransferRequestStatus =
  | "requested"
  | "invoiced"
  | "paid"
  | "cancelled";

export const BANK_TRANSFER_STATUS_LABELS: Record<BankTransferRequestStatus, string> = {
  requested: "申込受付",
  invoiced: "請求書送付済",
  paid: "入金確認済",
  cancelled: "取消",
};

/** 銀行振込契約者が Stripe 前提の操作（変更・解約・支払情報）に触れたときの案内文 */
export const BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE =
  "銀行振込でご契約中のプラン・オプションの変更や解約は、運営までご連絡ください";

/** 銀行振込の申込を処理中に、同じ対象へ別経路で申し込もうとしたときの案内文 */
export const BANK_TRANSFER_REQUEST_PENDING_MESSAGE =
  "銀行振込でのお申し込みを受付中です。請求書のご案内をお待ちください";

/** 一覧・詳細で「処理中」とみなす状態（二重申込の判定にも使う） */
export const OPEN_BANK_TRANSFER_STATUSES: readonly BankTransferRequestStatus[] = [
  "requested",
  "invoiced",
];

export type BankTransferTarget =
  | { kind: "plan"; planType: PaidPlanType; billingCycle: BillingCycle }
  | { kind: "option"; optionType: OptionType; billingCycle?: BillingCycle };

export interface BankTransferAmount {
  /** 本体価格（税込） */
  amount: number;
  /** 初回事務手数料（税込、該当時のみ > 0） */
  initialFee: number;
  /** 請求合計 */
  total: number;
}

/**
 * 申込金額を組み立てる。
 * - プラン: 月払い = 月額、年払い = 年額（暫定: 月額 × 12）。初回申込のみ事務手数料を加算
 * - オプション: 買い切りは単価。補償（月額課金型）は月払い = 月額、年払い = 月額 × 12
 */
export function computeBankTransferAmount(
  target: BankTransferTarget,
  opts: { needsInitialFee: boolean },
): BankTransferAmount {
  let amount: number;
  if (target.kind === "plan") {
    amount = planPriceFor(target.planType, target.billingCycle);
  } else {
    const unit = OPTION_PRICES_TAX_INCLUDED[target.optionType];
    amount = target.billingCycle === "yearly" ? unit * 12 : unit;
  }
  const initialFee =
    target.kind === "plan" && opts.needsInitialFee ? INITIAL_FEE_TAX_INCLUDED : 0;
  return { amount, initialFee, total: amount + initialFee };
}

// ---------------------------------------------------------------------------
// 暦日（YYYY-MM-DD）の計算。timestamptz ではなく date 文字列で扱い、
// 実行環境のタイムゾーンに依存しないよう UTC 基準で計算する。
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateString(dateStr: string): Date | null {
  const m = DATE_RE.exec(dateStr);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // 2026-02-31 のような不正日付を弾く
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidDateString(dateStr: string): boolean {
  return parseDateString(dateStr) !== null;
}

/**
 * 開始日に 1 か月 / 1 年を足した「翌期間の開始日」を返す。
 * 月末は月末に丸める（例: 01-31 + 1 か月 = 02-28 or 02-29、08-31 + 1 か月 = 09-30）。
 */
export function addBillingCycle(startDate: string, cycle: BillingCycle): string {
  const start = parseDateString(startDate);
  if (!start) return startDate;
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  const targetYear = cycle === "yearly" ? y + 1 : y;
  const targetMonth = cycle === "yearly" ? m : m + 1;
  // 対象月の末日（Date.UTC の day=0 は前月末日）
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return toDateString(
    new Date(Date.UTC(targetYear, targetMonth, Math.min(d, lastDay))),
  );
}

/**
 * 有効期限（最終利用日）= 翌期間の開始日の前日。
 * 例: 2026-09-15 開始・月払い → 2026-10-14 まで。
 */
export function computePeriodEnd(startDate: string, cycle: BillingCycle): string {
  const next = parseDateString(addBillingCycle(startDate, cycle));
  if (!next) return startDate;
  next.setUTCDate(next.getUTCDate() - 1);
  return toDateString(next);
}

/**
 * 暦日 → DB 保存用 timestamptz（Asia/Tokyo）。
 * 開始日は 00:00:00 JST、終了日は 23:59:59 JST として保存し、
 * 「期限日いっぱいまで利用可」を表す。
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

/** 2 つの暦日の差（b - a、日数）。 */
export function diffDays(a: string, b: string): number {
  const da = parseDateString(a);
  const db = parseDateString(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export type ExpiryBadge = "expired" | "expiring_soon";

export const EXPIRY_BADGE_LABELS: Record<ExpiryBadge, string> = {
  expired: "期限切れ",
  expiring_soon: "期限間近",
};

/** 期限間近とみなす残日数（この日数以内） */
export const EXPIRING_SOON_DAYS = 30;

/**
 * 銀行振込契約の期限バッジ。
 * - 期限日 < 今日 → 期限切れ
 * - 残り EXPIRING_SOON_DAYS 日以内 → 期限間近
 * - それ以外 → null
 * periodEnd / today は JST の暦日文字列。
 */
export function deriveExpiryBadge(
  periodEnd: string | null,
  today: string,
): ExpiryBadge | null {
  if (!periodEnd) return null;
  const remaining = diffDays(today, periodEnd);
  if (remaining < 0) return "expired";
  if (remaining <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return null;
}

/**
 * 申込対象の表示名。メール・管理画面・料金画面で共用する。
 * 例: 「ライトプラン（月払い）」「職場紹介動画」「補償（5,000円/月、最大200万円）（年払い）」
 */
export function describeBankTransferTarget(target: BankTransferTarget): string {
  if (target.kind === "plan") {
    return `${PLAN_LABELS[target.planType]}（${BILLING_CYCLE_LABELS[target.billingCycle]}）`;
  }
  const base = OPTION_LABELS[target.optionType];
  if (isSubscriptionOption(target.optionType) && target.billingCycle) {
    return `${base}（${BILLING_CYCLE_LABELS[target.billingCycle]}）`;
  }
  return base;
}

/** DB 行（bank_transfer_requests）から BankTransferTarget を復元する。不整合行は null。 */
export function targetFromRequestRow(row: {
  target_kind: "plan" | "option";
  plan_type: string | null;
  option_type: string | null;
  billing_cycle: BillingCycle;
}): BankTransferTarget | null {
  if (row.target_kind === "plan") {
    if (!row.plan_type || !(row.plan_type in PLAN_LABELS) || row.plan_type === "free") {
      return null;
    }
    return {
      kind: "plan",
      planType: row.plan_type as PaidPlanType,
      billingCycle: row.billing_cycle,
    };
  }
  if (!row.option_type || !(row.option_type in OPTION_LABELS)) return null;
  return {
    kind: "option",
    optionType: row.option_type as OptionType,
    billingCycle: row.billing_cycle,
  };
}
