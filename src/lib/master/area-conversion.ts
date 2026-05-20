/**
 * UI 層 ↔ DB 層の双方向変換 (master-area-multi-select Phase A Task 1.2)。
 *
 *   UI 層: AreaRow ({ prefecture, whole, municipalities: string[] }) — 1 行 = 1 県
 *   DB 層: AreaTuple ({ prefecture, municipality: string | null }) — 1 行 = 1 ペア
 *
 * 純粋関数として実装し、外部依存は `PREFECTURES` 定数と入力引数のみ。
 * Server Action / Server Component から呼ばれる。
 */

import type { AreaRow } from "@/components/area/types";
import type { AreaTuple } from "@/lib/master/validate-area";
import { PREFECTURES } from "@/lib/constants/options";

/**
 * UI 層の `AreaRow[]` を DB 層の `AreaTuple[]` に平坦化する。
 *
 *   - `whole === true` の行 → `[(prefecture, null)]`
 *   - `municipalities = [a, b, c]` → 同一県の 3 行に展開
 *   - 空行 (`whole === false && municipalities.length === 0`) や
 *     `prefecture === ""` の編集途中行は出力に含めない
 */
export function expandAreasForDb(rows: AreaRow[]): AreaTuple[] {
  const out: AreaTuple[] = [];
  for (const row of rows) {
    if (row.prefecture === "") continue;
    if (row.whole) {
      out.push({ prefecture: row.prefecture, municipality: null });
      continue;
    }
    if (row.municipalities.length === 0) continue;
    for (const muni of row.municipalities) {
      out.push({ prefecture: row.prefecture, municipality: muni });
    }
  }
  return out;
}

/**
 * DB 層の `AreaTuple[]` を UI 層の `AreaRow[]` に集約する。
 *
 *   - 同一 prefecture に NULL を含む → `whole = true` 優先で具体 muni を捨てる
 *     (R3-2 / Req 5-2 「県全域指定があれば市区町村は無視」)
 *   - 同一 prefecture が複数 muni を持つ場合は 1 行に集約
 *   - 戻り値は `PREFECTURES` 定数順 (北→南) で安定ソート
 *   - 各行の municipalities は `sortOrderMap[prefecture][muni]` の昇順
 *     (sortOrderMap に存在しない muni は末尾にフォールバック)
 *
 * `sortOrderMap` は呼び出し側 (Server Component の page.tsx) で
 * `getAllMunicipalityRows()` から `Record<prefecture, Record<muni, sort_order>>`
 * の形で構築して渡すこと。
 */
export function collapseAreasFromDb(
  pairs: AreaTuple[],
  sortOrderMap: Record<string, Record<string, number>>,
): AreaRow[] {
  interface Acc {
    whole: boolean;
    municipalities: Set<string>;
  }
  const map = new Map<string, Acc>();

  for (const pair of pairs) {
    let acc = map.get(pair.prefecture);
    if (!acc) {
      acc = { whole: false, municipalities: new Set<string>() };
      map.set(pair.prefecture, acc);
    }
    if (pair.municipality === null) {
      acc.whole = true;
    } else {
      acc.municipalities.add(pair.municipality);
    }
  }

  const result: AreaRow[] = [];
  for (const prefecture of PREFECTURES) {
    const acc = map.get(prefecture);
    if (!acc) continue;
    if (acc.whole) {
      // 混在ケースは whole 優先で具体 muni を捨てる
      result.push({ prefecture, whole: true, municipalities: [] });
      continue;
    }
    const muniSortMap = sortOrderMap[prefecture] ?? {};
    const sorted = Array.from(acc.municipalities).sort((a, b) => {
      const aOrder = muniSortMap[a];
      const bOrder = muniSortMap[b];
      const aHas = aOrder !== undefined;
      const bHas = bOrder !== undefined;
      if (aHas && bHas) return aOrder - bOrder;
      if (aHas) return -1;
      if (bHas) return 1;
      return a.localeCompare(b, "ja");
    });
    result.push({ prefecture, whole: false, municipalities: sorted });
  }
  return result;
}
