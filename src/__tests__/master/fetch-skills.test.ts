/**
 * master-skills（trade-types / qualifications / skill-tags）fetch の失敗時挙動。
 *
 * 2026-07-11 回帰防止: fetch 失敗を空配列で返すと `unstable_cache` が「空 = 正常」
 * として最大 1 時間（staging/本番は Data Cache に永続）キャッシュし、
 * `validateLabelChanges` が全ラベルを「存在しない職種」と誤判定する。
 * キャッシュ境界の内側（プリミティブ / Or-Throw アクセサ）は throw して失敗を
 * キャッシュさせず、描画用アクセサはキャッシュ境界の外側で catch → [] にフォールバックする。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// unstable_cache はパススルー（毎回 fetch 関数を実行）
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// "ok" = 正常データ / "error" = PostgREST error を返す
let mode: "ok" | "error" = "ok";
const okRows = [
  { label: "建築/仕上げ｜フィルム・シート工", deprecated_at: null },
  { label: "建築/廃止｜旧職種", deprecated_at: "2026-04-01T00:00:00.000Z" },
];

vi.mock("@/lib/supabase/anon", () => {
  function makeBuilder() {
    const builder = {
      select: () => builder,
      order: () => builder,
      is: () => builder,
      // builder 自体を thenable にし、await で {data, error} を解決する
      then: (resolve: (value: unknown) => unknown) =>
        resolve(
          mode === "error"
            ? { data: null, error: { message: "boom" } }
            : { data: okRows, error: null },
        ),
    };
    return builder;
  }
  return { createAnonClient: () => ({ from: () => makeBuilder() }) };
});

import {
  getAllMasterRows,
  getAllMasterRowsOrThrow,
  getActiveTradeTypes,
} from "@/lib/master/fetch";

beforeEach(() => {
  mode = "ok";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("master-skills fetch の失敗時挙動", () => {
  it("成功時 getAllMasterRowsOrThrow は行を返す", async () => {
    mode = "ok";
    const rows = await getAllMasterRowsOrThrow("trade-types");
    expect(rows).toHaveLength(okRows.length);
    expect(rows.map((r) => r.label)).toContain(
      "建築/仕上げ｜フィルム・シート工",
    );
  });

  it("取得失敗時 検証用 getAllMasterRowsOrThrow は reject（＝空をキャッシュさせない）", async () => {
    mode = "error";
    await expect(getAllMasterRowsOrThrow("trade-types")).rejects.toThrow();
  });

  it("取得失敗時 描画用 getAllMasterRows は [] にフォールバック（ページは描画可能）", async () => {
    mode = "error";
    await expect(getAllMasterRows("trade-types")).resolves.toEqual([]);
  });

  it("取得失敗時 active プリミティブ getActiveTradeTypes も reject", async () => {
    mode = "error";
    await expect(getActiveTradeTypes()).rejects.toThrow();
  });
});
