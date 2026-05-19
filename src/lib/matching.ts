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
