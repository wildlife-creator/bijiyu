/**
 * master_municipalities のページネーション回帰テスト。
 *
 * 背景: PostgREST の max_rows（既定 1000）により、ページ分割しない 1 クエリでは
 * 1000 件で打ち切られ、sort_order 後半（静岡県以降）の市区町村が欠落していた
 * （入力系 5 画面・検索系 3 画面のエリア選択で再現）。
 * fetchAllPages による `.range()` ループで全件取得することを検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAGE_SIZE = 1000;
const TOTAL = 1897; // 本番マスタの実件数に合わせる（> PAGE_SIZE で 2 ページ必須）

// 1,897 件のダミー行を生成。3 件を廃止（deprecated）にして active 抽出も検証する。
const DEPRECATED_INDICES = new Set([5, 6, 7]);
const allRows = Array.from({ length: TOTAL }, (_, i) => ({
  prefecture: `pref-${Math.floor(i / 40)}`,
  municipality: `muni-${i}`,
  deprecated_at: DEPRECATED_INDICES.has(i) ? "2026-04-01T00:00:00.000Z" : null,
}));
const activeRows = allRows.filter((r) => r.deprecated_at === null);

// range(from, to) の呼び出し履歴を記録するスパイ
const rangeSpy = vi.fn<(from: number, to: number) => void>();
// 特定ページで error を返させるためのフック（null = 全ページ成功）
let errorOnRangeFrom: number | null = null;

vi.mock("next/cache", () => ({
  // unstable_cache はパススルー（毎回 fetch 関数を実行）
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/supabase/anon", () => {
  function makeBuilder() {
    const state = { onlyActive: false };
    const builder = {
      select: () => builder,
      order: () => builder,
      is: () => {
        // .is("deprecated_at", null) が呼ばれた = active 限定クエリ
        state.onlyActive = true;
        return builder;
      },
      range: (from: number, to: number) => {
        rangeSpy(from, to);
        if (errorOnRangeFrom !== null && from === errorOnRangeFrom) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        const source = state.onlyActive ? activeRows : allRows;
        return Promise.resolve({ data: source.slice(from, to + 1), error: null });
      },
    };
    return builder;
  }
  return {
    createAnonClient: () => ({ from: () => makeBuilder() }),
  };
});

import {
  getActiveMunicipalities,
  getAllMunicipalityRows,
} from "@/lib/master/fetch";

beforeEach(() => {
  rangeSpy.mockClear();
  errorOnRangeFrom = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getActiveMunicipalities（ページネーション）", () => {
  it("1000 件で打ち切られず active 全件（1894 件）を返す", async () => {
    const rows = await getActiveMunicipalities();
    expect(rows).toHaveLength(activeRows.length);
    expect(activeRows.length).toBeGreaterThan(PAGE_SIZE);
  });

  it("1000 件目以降（静岡県相当）の市区町村も含まれる", async () => {
    const rows = await getActiveMunicipalities();
    // 旧実装では index 1000 以降が欠落していた
    expect(rows.some((r) => r.municipality === "muni-1500")).toBe(true);
    expect(rows.some((r) => r.municipality === `muni-${TOTAL - 1}`)).toBe(true);
  });

  it("廃止（deprecated）行は除外される", async () => {
    const rows = await getActiveMunicipalities();
    expect(rows.some((r) => r.municipality === "muni-5")).toBe(false);
  });

  it(".range() が複数ページ分（0-999, 1000-1999）呼ばれる", async () => {
    await getActiveMunicipalities();
    const calls = rangeSpy.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toEqual([0, PAGE_SIZE - 1]);
    expect(calls[1]).toEqual([PAGE_SIZE, PAGE_SIZE * 2 - 1]);
  });
});

describe("getAllMunicipalityRows（ページネーション）", () => {
  it("廃止を含む全 1897 件を返す", async () => {
    const rows = await getAllMunicipalityRows();
    expect(rows).toHaveLength(TOTAL);
    expect(rows.some((r) => r.municipality === "muni-5")).toBe(true);
    expect(rows.some((r) => r.municipality === `muni-${TOTAL - 1}`)).toBe(true);
  });
});

describe("ページ取得エラー時のフォールバック", () => {
  it("途中ページで error が出たら空配列を返す（不完全データを返さない）", async () => {
    errorOnRangeFrom = PAGE_SIZE; // 2 ページ目で失敗させる
    const rows = await getActiveMunicipalities();
    expect(rows).toEqual([]);
  });
});
