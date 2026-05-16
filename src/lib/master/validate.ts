/**
 * label 変更の delta 検証。
 *
 * 保存系 Server Action（profile / register-profile / client-profile / jobs）から
 * 「保存直前に DB から previousLabels を SELECT → validateLabelChanges →
 * 既存 RPC / UPSERT」のシーケンスで呼ばれる。
 *
 * 検証ルール（R3 AC-13 / R9 AC-3 等）:
 *   - added（newLabels に追加された分）は master に存在し、かつ
 *     `deprecated_at IS NULL` であること
 *   - 既存保有の deprecated はそのまま保持を許可する（previousLabels に
 *     入っていれば newLabels に残っていても OK）
 *
 * 内部は `getAllMasterRows(kind)` のキャッシュ済み in-memory データを
 * 使い、追加 DB ラウンドトリップを発生させない。
 */
import { getAllMasterRows, type MasterKind } from "./fetch";

export type ValidateLabelChangesResult =
  | { valid: true }
  | { valid: false; unknownLabels: string[]; deprecatedLabels: string[] };

export async function validateLabelChanges(
  newLabels: string[],
  previousLabels: string[],
  kind: MasterKind,
): Promise<ValidateLabelChangesResult> {
  const previousSet = new Set(previousLabels);
  const added = Array.from(new Set(newLabels)).filter(
    (label) => !previousSet.has(label),
  );

  if (added.length === 0) {
    return { valid: true };
  }

  const allRows = await getAllMasterRows(kind);
  const allMap = new Map<string, string | null>(
    allRows.map((row) => [row.label, row.deprecated_at]),
  );

  const unknownLabels: string[] = [];
  const deprecatedLabels: string[] = [];
  for (const label of added) {
    if (!allMap.has(label)) {
      unknownLabels.push(label);
    } else if (allMap.get(label) !== null) {
      deprecatedLabels.push(label);
    }
  }

  if (unknownLabels.length === 0 && deprecatedLabels.length === 0) {
    return { valid: true };
  }
  return { valid: false, unknownLabels, deprecatedLabels };
}
