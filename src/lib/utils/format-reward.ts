/**
 * 報酬レンジの共通フォーマッタ。
 *
 * 案件カード（CON-002 等）/ 案件詳細（CON-003 / CLI-002）/ メッセージ等で
 * `reward_lower` / `reward_upper` を「下限〜上限（人工）」の形式で表示する
 * 共通ヘルパー。
 *
 * 既存実装 (`src/components/job-search/job-list-card.tsx` の `formatReward`)
 * と同じセマンティクスを維持。空のときの emptyLabel は呼び出し側で指定する
 * (カードは「要相談」、詳細は null フォールバックなど用途で異なるため)。
 */
export function formatRewardRange(
  lower: number | null | undefined,
  upper: number | null | undefined,
  options: { emptyLabel?: string | null } = {},
): string | null {
  const { emptyLabel = null } = options;
  if (lower && upper) {
    return `${lower.toLocaleString()}円〜${upper.toLocaleString()}円（人工）`;
  }
  if (lower) return `${lower.toLocaleString()}円〜（人工）`;
  if (upper) return `〜${upper.toLocaleString()}円（人工）`;
  return emptyLabel;
}
