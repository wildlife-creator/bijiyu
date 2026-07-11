import {
  addDaysToDateString,
  formatDate,
  getJstToday,
} from "@/lib/utils/format-date";

/**
 * 応募可否マッチング判定。
 *
 * Paid users（subscriptions.status IN ('active','past_due') か role='client'）
 * は無条件で `canApply: true`。
 * 無料の受注者は、案件の `trade_types` のいずれかが自分の対応職種に含まれ、
 * かつ案件の **どれかの都道府県** が自分の登録県に含まれる場合のみ応募可能
 * （trade_types / prefectures とも配列の OR 一致）。
 *
 * 階層構造を利用したあいまいマッチング（親一致等）は行わない（厳密一致のみ）。
 * `role='staff'` の応募ボタン非表示は UI 側で別途処理する。
 *
 * 市区町村レベルのマッチング判定は行わない (Req 7)。jobPrefectures は配列だが
 * 案件の市区町村 (job_areas.municipality) は無視される。CLAUDE.md「マッチング
 * 判定は都道府県のまま」ルール。
 */

export interface CanApplyJobParams {
  userRole: "contractor" | "client" | "staff";
  isPaidUser: boolean;
  jobTradeTypes: string[];
  jobPrefectures: string[];
  userSkills: Array<{ tradeType: string }>;
  userAvailableAreas: Array<{ prefecture: string }>;
}

export interface CanApplyJobResult {
  canApply: boolean;
  reason?: string;
}

export function canApplyJob(params: CanApplyJobParams): CanApplyJobResult {
  if (params.isPaidUser) {
    return { canApply: true };
  }

  if (params.jobPrefectures.length === 0) {
    return {
      canApply: false,
      reason:
        "有料プランに加入するか、プロフィールの職種・エリアを更新してください",
    };
  }

  const hasMatchingSkill = params.jobTradeTypes.some((jobTrade) =>
    params.userSkills.some((s) => s.tradeType === jobTrade),
  );
  const hasMatchingArea = params.jobPrefectures.some((jobPref) =>
    params.userAvailableAreas.some((a) => a.prefecture === jobPref),
  );

  if (hasMatchingSkill && hasMatchingArea) {
    return { canApply: true };
  }

  return {
    canApply: false,
    reason:
      "有料プランに加入するか、プロフィールの職種・エリアを更新してください",
  };
}

// ---------------------------------------------------------------------------
// 評価・完了報告の入力可能期間
// ---------------------------------------------------------------------------
//
// 入力可能期間 = 初回稼働日（applications.first_work_date）〜 稼働終了日
// （jobs.work_end_date）+ REVIEW_INPUT_GRACE_DAYS 日。JST の暦日で判定する。
// いずれかの基準日が NULL の場合、その側のガードはスキップする（後方互換のため）。
// 受注者（CON-013）・発注者（CLI-012）の双方に同一ルールを適用する。

/** 稼働終了日から評価・完了報告を入力できる猶予日数。 */
export const REVIEW_INPUT_GRACE_DAYS = 5;

/** 期間外の理由。null = 期間内。 */
export type ReviewInputWindowReason = "before-start" | "after-end";

export interface ReviewInputWindow {
  /** 入力開始日（初回稼働日, "YYYY-MM-DD"）。null = 開始ガードなし。 */
  startDate: string | null;
  /** 入力終了日（稼働終了日 + 猶予日数, "YYYY-MM-DD"）。null = 終了ガードなし。 */
  endDate: string | null;
}

export interface ReviewInputWindowResult extends ReviewInputWindow {
  /** 入力可能なら true。 */
  allowed: boolean;
  /** 期間外の理由。allowed=true のとき null。 */
  reason: ReviewInputWindowReason | null;
}

/**
 * 入力可能期間の開始日・終了日を算出する純粋関数。
 * @param firstWorkDate 初回稼働日（"YYYY-MM-DD" or null）
 * @param workEndDate   稼働期間の終了日（"YYYY-MM-DD" or null）
 */
export function computeReviewInputWindow(
  firstWorkDate: string | null | undefined,
  workEndDate: string | null | undefined,
): ReviewInputWindow {
  return {
    startDate: firstWorkDate || null,
    endDate: workEndDate
      ? addDaysToDateString(workEndDate, REVIEW_INPUT_GRACE_DAYS)
      : null,
  };
}

/**
 * 指定した JST 暦日（"YYYY-MM-DD"）が入力可能期間内かを判定する純粋関数。
 * 開始日・終了日はいずれも当日を含む（inclusive）。
 */
export function isWithinReviewInputWindow(
  today: string,
  window: ReviewInputWindow,
): { allowed: boolean; reason: ReviewInputWindowReason | null } {
  if (window.startDate && today < window.startDate) {
    return { allowed: false, reason: "before-start" };
  }
  if (window.endDate && today > window.endDate) {
    return { allowed: false, reason: "after-end" };
  }
  return { allowed: true, reason: null };
}

/**
 * 初回稼働日・稼働終了日と基準時刻から、評価・完了報告を入力できるかを判定する。
 * Server Action と report ページの二重防御で共通利用する。
 * @param now テスト用の基準時刻（省略時は現在時刻）。JST 暦日に変換して比較する。
 */
export function evaluateReviewInputWindow(params: {
  firstWorkDate: string | null | undefined;
  workEndDate: string | null | undefined;
  now?: Date;
}): ReviewInputWindowResult {
  const window = computeReviewInputWindow(
    params.firstWorkDate,
    params.workEndDate,
  );
  const today = getJstToday(params.now ?? new Date());
  const { allowed, reason } = isWithinReviewInputWindow(today, window);
  return { ...window, allowed, reason };
}

/**
 * 期間外のときにユーザーへ表示する日本語メッセージを返す。期間内なら null。
 * Server Action のエラー文言と report ページの案内文言で共通利用する。
 */
export function reviewInputWindowMessage(
  result: ReviewInputWindowResult,
): string | null {
  if (result.allowed) return null;
  if (result.reason === "before-start") {
    return `評価・完了報告は初回稼働日（${formatDate(result.startDate)}）以降に入力できます。`;
  }
  return `評価・完了報告の入力期間（${formatDate(result.endDate)}まで）を過ぎたため、入力できません。`;
}

// ---------------------------------------------------------------------------
// 発注確定後キャンセル（受注者・CON-012）の可否
// ---------------------------------------------------------------------------
//
// 発注済み(accepted) の応募を受注者が自力キャンセルできるのは「初回稼働日の
// 5日前の当日まで（JST 暦日）」。例: 初回稼働日 11/22 なら 11/17 23:59（JST）
// まで可能で、11/18 以降は不可。初回稼働日が未設定(null)なら日付制限なし。
// JST の暦日文字列で比較するため、本番(UTC)でも 9 時間ズレない
// （旧実装は new Date("YYYY-MM-DD") を UTC 深夜=JST 9:00 で解釈しており、
// 5日前の当日は 9:00 で締まってしまう不具合があった）。
// 発注者側の管理者キャンセル(canAdminCancel)と同じ「UI と Server Action で
// 同一の純粋関数を共有する」方針に揃える。

/** 受注者が発注確定後にキャンセルできる、初回稼働日からの猶予日数（この日数前の当日まで可）。 */
export const CONTRACTOR_CANCEL_CUTOFF_DAYS = 5;

/**
 * 受注者による発注確定後キャンセルの可否。
 * UI（CON-012 のボタン表示）と Server Action（cancelApplicationAction）で
 * 同一関数を使うこと。
 * @param today getJstToday() が返す JST 暦日 "YYYY-MM-DD"
 */
export function canContractorCancel(
  app: { status: string; first_work_date: string | null },
  today: string,
): boolean {
  if (app.status !== "accepted") return false;
  if (!app.first_work_date) return true;
  return today <= addDaysToDateString(app.first_work_date, -CONTRACTOR_CANCEL_CUTOFF_DAYS);
}
