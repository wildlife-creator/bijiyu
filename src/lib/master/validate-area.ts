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

export interface AreaTuple {
  prefecture: string;
  municipality: string | null;
}

export type ValidateAreaChangesResult =
  | { valid: true }
  | {
      valid: false;
      unknownPairs: AreaTuple[];
      deprecatedPairs: AreaTuple[];
    };

export function isKnownPrefecture(prefecture: string): boolean {
  return PREFECTURE_SET.has(prefecture);
}

function areaKey(area: AreaTuple): string {
  return `${area.prefecture}|${area.municipality ?? ""}`;
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
    const allRows = await getAllMunicipalityRows();
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
  return { valid: false, unknownPairs, deprecatedPairs };
}
