/**
 * 市区町村マスタの delta 整合性検証。
 *
 * 保存系 Server Action（profile / register-profile / client-profile / jobs）から
 * 「保存直前に DB から previousAreas を SELECT → validateAreaChanges →
 * 既存 RPC / UPSERT」のシーケンスで呼ばれる。
 *
 * 検証ルール（Req 2.10 / 3.7 / 4.9）:
 *   - municipality === null は「県全域」扱い。マスタ照合不要で、prefecture が
 *     47 都道府県のいずれかであることだけ軽量チェック
 *   - added (newAreas に追加された分) は (prefecture, municipality) が
 *     master_municipalities に存在し、かつ deprecated_at IS NULL であること
 *   - 既存保有の deprecated はそのまま保持を許可する (previousAreas に
 *     入っていれば newAreas に残っていても OK)
 *
 * 内部は `getAllMunicipalityRows()` のキャッシュ済み in-memory データを
 * 使い、追加 DB ラウンドトリップを発生させない。master-skills の
 * validateLabelChanges と同セマンティクス。
 */
import { PREFECTURES } from "@/lib/constants/options";
import { getAllMunicipalityRows } from "./fetch";

const PREFECTURE_SET = new Set<string>(PREFECTURES);

export type AreaTuple = {
  prefecture: string;
  municipality: string | null;
};

export type ValidateAreaChangesResult =
  | { valid: true }
  // マスタ取得に一時的に失敗した状態。「存在しない」と断定してはならず、
  // 呼び出し元は「時間をおいて再度お試しください」を表示する。
  | { valid: false; transient: true }
  | {
      valid: false;
      transient: false;
      unknownPairs: AreaTuple[];
      deprecatedPairs: AreaTuple[];
    };

export type AreaValidationFailure = Extract<
  ValidateAreaChangesResult,
  { valid: false }
>;

export function isKnownPrefecture(prefecture: string): boolean {
  return PREFECTURE_SET.has(prefecture);
}

function areaKey(area: AreaTuple): string {
  return `${area.prefecture}|${area.municipality ?? ""}`;
}

function formatAreaTuple(a: AreaTuple): string {
  return a.municipality ? `${a.prefecture}${a.municipality}` : a.prefecture;
}

/**
 * 検証失敗結果を UI 向けエラーメッセージに変換する共通ヘルパー。
 * transient（マスタ取得の一時失敗）を必ず先に分岐し、「存在しない」誤断定を防ぐ。
 * 全呼び出し元はこのヘルパー経由でメッセージを組むこと。
 */
export function areaValidationErrorMessage(
  failure: AreaValidationFailure,
  deprecatedAction = "登録",
): string {
  if (failure.transient) {
    return "エリアマスタの取得に一時的に失敗しました。時間をおいて再度お試しください。";
  }
  if (failure.unknownPairs.length > 0) {
    return `存在しないエリアが含まれています: ${failure.unknownPairs.map(formatAreaTuple).join("、")}`;
  }
  return `廃止されたエリアは${deprecatedAction}できません: ${failure.deprecatedPairs.map(formatAreaTuple).join("、")}`;
}

export async function validateAreaChanges(
  newAreas: AreaTuple[],
  previousAreas: AreaTuple[],
): Promise<ValidateAreaChangesResult> {
  const previousSet = new Set(previousAreas.map(areaKey));

  // dedupe newAreas while computing added
  const seen = new Set<string>();
  const added: AreaTuple[] = [];
  for (const a of newAreas) {
    const k = areaKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!previousSet.has(k)) added.push(a);
  }

  if (added.length === 0) return { valid: true };

  const unknownPairs: AreaTuple[] = [];
  const deprecatedPairs: AreaTuple[] = [];

  const prefectureOnlyAdds = added.filter((a) => a.municipality === null);
  const municipalityAdds = added.filter((a) => a.municipality !== null);

  for (const a of prefectureOnlyAdds) {
    if (!isKnownPrefecture(a.prefecture)) {
      unknownPairs.push(a);
    }
  }

  if (municipalityAdds.length > 0) {
    let allRows: Awaited<ReturnType<typeof getAllMunicipalityRows>>;
    try {
      allRows = await getAllMunicipalityRows();
    } catch {
      // マスタ取得の一時失敗。municipalityAdds を「存在しない」と誤判定しない。
      return { valid: false, transient: true };
    }
    const masterMap = new Map<string, string | null>(
      allRows.map((r) => [
        `${r.prefecture}|${r.municipality}`,
        r.deprecated_at,
      ]),
    );
    for (const a of municipalityAdds) {
      const key = `${a.prefecture}|${a.municipality}`;
      if (!masterMap.has(key)) {
        unknownPairs.push(a);
      } else if (masterMap.get(key) !== null) {
        deprecatedPairs.push(a);
      }
    }
  }

  if (unknownPairs.length === 0 && deprecatedPairs.length === 0) {
    return { valid: true };
  }
  return { valid: false, transient: false, unknownPairs, deprecatedPairs };
}
