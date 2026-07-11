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
import { getAllMasterRowsOrThrow, type MasterKind } from "./fetch";

export type ValidateLabelChangesResult =
  | { valid: true }
  // マスタ取得に一時的に失敗した状態。「存在しない」と断定してはならず、
  // 呼び出し元は「時間をおいて再度お試しください」を表示する。
  | { valid: false; transient: true }
  | {
      valid: false;
      transient: false;
      unknownLabels: string[];
      deprecatedLabels: string[];
    };

export type LabelValidationFailure = Extract<
  ValidateLabelChangesResult,
  { valid: false }
>;

/**
 * 検証失敗結果を UI 向けエラーメッセージに変換する共通ヘルパー。
 * transient（マスタ取得の一時失敗）を必ず先に分岐し、「存在しない」誤断定を防ぐ。
 * 全呼び出し元はこのヘルパー経由でメッセージを組むこと。
 */
export function labelValidationErrorMessage(
  failure: LabelValidationFailure,
  noun: string,
  deprecatedAction = "登録",
): string {
  if (failure.transient) {
    // 「マスタ」等の開発用語は使わず、ユーザーに伝わる汎用文言で統一する。
    return "データの取得に一時的に失敗しました。時間をおいて再度お試しください。";
  }
  if (failure.unknownLabels.length > 0) {
    return `存在しない${noun}が含まれています: ${failure.unknownLabels.join("、")}`;
  }
  return `廃止された${noun}は${deprecatedAction}できません: ${failure.deprecatedLabels.join("、")}`;
}

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

  let allRows: Awaited<ReturnType<typeof getAllMasterRowsOrThrow>>;
  try {
    allRows = await getAllMasterRowsOrThrow(kind);
  } catch {
    // マスタ取得の一時失敗。added を「存在しない」と誤判定しない。
    return { valid: false, transient: true };
  }
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
  return { valid: false, transient: false, unknownLabels, deprecatedLabels };
}
