import { describe, expect, it } from "vitest";

import {
  expandAreasForDb,
  collapseAreasFromDb,
} from "@/lib/master/area-conversion";
import type { AreaRow } from "@/components/area/types";

/**
 * master-area-multi-select Phase A Task 1.4
 *
 * 純粋関数 `expandAreasForDb` / `collapseAreasFromDb` の単体テスト。
 * 副作用なし・I/O なしのため Supabase / fetch のモック不要。
 */

describe("expandAreasForDb", () => {
  it("県全域単独行は (prefecture, null) 1 件に展開", () => {
    const rows: AreaRow[] = [
      { prefecture: "東京都", whole: true, municipalities: [] },
    ];
    expect(expandAreasForDb(rows)).toEqual([
      { prefecture: "東京都", municipality: null },
    ]);
  });

  it("複数 muni を含む行は同一県の複数行に展開", () => {
    const rows: AreaRow[] = [
      {
        prefecture: "東京都",
        whole: false,
        municipalities: ["港区", "渋谷区", "新宿区"],
      },
    ];
    expect(expandAreasForDb(rows)).toEqual([
      { prefecture: "東京都", municipality: "港区" },
      { prefecture: "東京都", municipality: "渋谷区" },
      { prefecture: "東京都", municipality: "新宿区" },
    ]);
  });

  it("複数県の混在を展開", () => {
    const rows: AreaRow[] = [
      { prefecture: "東京都", whole: true, municipalities: [] },
      {
        prefecture: "神奈川県",
        whole: false,
        municipalities: ["横浜市中区", "川崎市川崎区"],
      },
    ];
    expect(expandAreasForDb(rows)).toEqual([
      { prefecture: "東京都", municipality: null },
      { prefecture: "神奈川県", municipality: "横浜市中区" },
      { prefecture: "神奈川県", municipality: "川崎市川崎区" },
    ]);
  });

  it("空行 (whole=false && municipalities=[]) は出力に含めない", () => {
    const rows: AreaRow[] = [
      { prefecture: "東京都", whole: true, municipalities: [] },
      { prefecture: "", whole: false, municipalities: [] },
      { prefecture: "神奈川県", whole: false, municipalities: [] },
    ];
    expect(expandAreasForDb(rows)).toEqual([
      { prefecture: "東京都", municipality: null },
    ]);
  });

  it("入力 0 件は出力 0 件", () => {
    expect(expandAreasForDb([])).toEqual([]);
  });
});

describe("collapseAreasFromDb", () => {
  const sortOrderMap = {
    東京都: { 港区: 1, 渋谷区: 2, 新宿区: 3 },
    神奈川県: { 横浜市中区: 1, 川崎市川崎区: 2 },
    千葉県: {},
  };

  it("単一行 (県全域) を AreaRow 1 件に集約", () => {
    expect(
      collapseAreasFromDb([{ prefecture: "東京都", municipality: null }], sortOrderMap),
    ).toEqual([{ prefecture: "東京都", whole: true, municipalities: [] }]);
  });

  it("同一県の複数 muni を 1 行に集約し sort_order 昇順でソート", () => {
    const pairs = [
      { prefecture: "東京都", municipality: "渋谷区" },
      { prefecture: "東京都", municipality: "新宿区" },
      { prefecture: "東京都", municipality: "港区" },
    ];
    expect(collapseAreasFromDb(pairs, sortOrderMap)).toEqual([
      {
        prefecture: "東京都",
        whole: false,
        municipalities: ["港区", "渋谷区", "新宿区"],
      },
    ]);
  });

  it("同一県内に NULL と具体 muni が混在する場合は県全域優先で具体 muni を捨てる", () => {
    const pairs = [
      { prefecture: "東京都", municipality: null },
      { prefecture: "東京都", municipality: "港区" },
      { prefecture: "東京都", municipality: "渋谷区" },
    ];
    expect(collapseAreasFromDb(pairs, sortOrderMap)).toEqual([
      { prefecture: "東京都", whole: true, municipalities: [] },
    ]);
  });

  it("複数県を PREFECTURES 定数順 (北→南) で安定ソート", () => {
    const pairs = [
      { prefecture: "神奈川県", municipality: "横浜市中区" },
      { prefecture: "東京都", municipality: "港区" },
    ];
    const out = collapseAreasFromDb(pairs, sortOrderMap);
    expect(out.map((r) => r.prefecture)).toEqual(["東京都", "神奈川県"]);
  });

  it("空入力で空配列を返す", () => {
    expect(collapseAreasFromDb([], sortOrderMap)).toEqual([]);
  });

  it("sortOrderMap に存在しない muni は末尾にフォールバック (文字列昇順)", () => {
    const pairs = [
      { prefecture: "東京都", municipality: "存在しない区" },
      { prefecture: "東京都", municipality: "港区" },
      { prefecture: "東京都", municipality: "渋谷区" },
    ];
    const result = collapseAreasFromDb(pairs, sortOrderMap);
    expect(result).toHaveLength(1);
    // 港区 (1) → 渋谷区 (2) → 存在しない区 (no sort_order, fallback to end)
    expect(result[0].municipalities).toEqual([
      "港区",
      "渋谷区",
      "存在しない区",
    ]);
  });

  it("sortOrderMap に prefecture が存在しない場合は文字列昇順フォールバック", () => {
    const pairs = [
      { prefecture: "千葉県", municipality: "千葉市中央区" },
      { prefecture: "千葉県", municipality: "船橋市" },
    ];
    const result = collapseAreasFromDb(pairs, sortOrderMap);
    expect(result).toHaveLength(1);
    expect(result[0].municipalities).toEqual(["千葉市中央区", "船橋市"]);
  });
});

describe("expand → collapse → expand 冪等性", () => {
  const sortOrderMap = {
    東京都: { 港区: 1, 渋谷区: 2, 新宿区: 3 },
    神奈川県: { 横浜市中区: 1, 川崎市川崎区: 2 },
  };

  it("県全域単独行は往復で不変", () => {
    const rows: AreaRow[] = [
      { prefecture: "東京都", whole: true, municipalities: [] },
    ];
    const round1 = expandAreasForDb(rows);
    const round2 = expandAreasForDb(collapseAreasFromDb(round1, sortOrderMap));
    expect(round2).toEqual(round1);
  });

  it("複数 muni 行は往復で不変 (sort_order 順に整列されるが内容は不変)", () => {
    const rows: AreaRow[] = [
      {
        prefecture: "東京都",
        whole: false,
        municipalities: ["港区", "渋谷区", "新宿区"],
      },
    ];
    const round1 = expandAreasForDb(rows);
    const round2 = expandAreasForDb(collapseAreasFromDb(round1, sortOrderMap));
    expect(round2).toEqual(round1);
  });

  it("複数県混在は往復で不変 (両県とも復元される)", () => {
    const rows: AreaRow[] = [
      { prefecture: "東京都", whole: true, municipalities: [] },
      {
        prefecture: "神奈川県",
        whole: false,
        municipalities: ["横浜市中区", "川崎市川崎区"],
      },
    ];
    const round1 = expandAreasForDb(rows);
    const round2 = expandAreasForDb(collapseAreasFromDb(round1, sortOrderMap));
    expect(round2).toEqual(round1);
  });
});
