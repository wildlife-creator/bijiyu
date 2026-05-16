/**
 * 廃止サフィックス「（廃止）」の付与・除去・判定。
 *
 * 編集画面（COM-002 / AUTH-006 / CLI-021 / job-form 等）でのみ使用する。
 * 表示専用画面では呼ばない（R9 AC-9）。
 * 保存時は `stripDeprecatedSuffix` で素の label に戻してから validate に渡す。
 */

export const DEPRECATED_SUFFIX = "（廃止）";

export function applyDeprecatedSuffix(
  labels: string[],
  deprecatedSet: Set<string>,
): string[] {
  return labels.map((label) =>
    deprecatedSet.has(label) ? `${label}${DEPRECATED_SUFFIX}` : label,
  );
}

export function isDeprecated(label: string): boolean {
  return label.endsWith(DEPRECATED_SUFFIX);
}

export function stripDeprecatedSuffix(label: string): string {
  return label.endsWith(DEPRECATED_SUFFIX)
    ? label.slice(0, label.length - DEPRECATED_SUFFIX.length)
    : label;
}
