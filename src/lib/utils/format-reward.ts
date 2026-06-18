/**
 * 報酬の共通フォーマッタ。
 *
 * 案件カード (CON-002 等) / 案件詳細 (CON-003 / CLI-002) /
 * 応募一覧・詳細 / メッセージ / マイページ等で
 * `reward_lower` / `reward_upper` を統一形式で表示する。
 *
 * 入力フォーム (CLI-003 / CLI-004) では **上限が必須・下限は任意**。
 * 公開済み案件で実際に発生する組み合わせは「両方あり (範囲)」または
 * 「上限のみ」の 2 通り。「下限のみ」「両方なし」は下書きでのみ発生しうる。
 *
 * 表示パターン:
 * - 両方あり: "26,000円〜32,000円（人工）"
 * - 上限のみ: "32,000円（人工）" (上限を案件の代表値として単体表示)
 * - 下限のみ: "26,000円〜（人工）" (公開済では稀)
 * - 両方なし: options.emptyLabel (デフォルト null)
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
  if (upper) return `${upper.toLocaleString()}円（人工）`;
  if (lower) return `${lower.toLocaleString()}円〜（人工）`;
  return emptyLabel;
}
