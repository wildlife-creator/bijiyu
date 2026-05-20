import { describe, expect, it, vi } from "vitest";

import { buildAreaFilterIds } from "@/lib/utils/area-search-clauses";

/**
 * 上位包含クエリビルダーの単体テスト。
 *
 * Supabase client は最小限のチェイナブル mock で表現する:
 *   .from(table).select(cols).eq(col, val).is(col, null) etc.
 * `eq` / `is` などはチェイン可能、最終 await でデータを返す。
 */

interface MockResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Build a thenable mock chain that ignores all filters and resolves to the
 * provided result. Allows arbitrary `.eq()` / `.is()` chaining.
 */
function mockQuery<T>(result: MockResult<T>) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.then = (resolve: (v: MockResult<T>) => unknown) =>
    Promise.resolve(result).then(resolve);
  chain.select = vi.fn(() => chain);
  return chain;
}

interface CallSpec {
  prefecture: string;
  municipalityCondition: "eq" | "is-null" | null;
  result: MockResult<{ job_id?: string; client_id?: string; user_id?: string }>;
}

/**
 * Build supabase mock whose `.from(table)` returns chained queries.
 * Each `.from()` call dequeues the next pre-specified result.
 */
function buildSupabase(byTable: Record<string, MockResult<unknown>[]>) {
  const queues = new Map<string, MockResult<unknown>[]>(Object.entries(byTable));
  return {
    from: vi.fn((table: string) => {
      const next = queues.get(table)?.shift();
      if (!next) throw new Error(`Unexpected .from('${table}') call`);
      return mockQuery(next);
    }),
  };
}

describe("buildAreaFilterIds", () => {
  describe("prefecture = null → 無絞り込み", () => {
    it("null を返す (呼び出し側で .in() スキップ)", async () => {
      const supabase = buildSupabase({}) as never;
      const result = await buildAreaFilterIds({
        entity: "job",
        prefecture: null,
        municipality: null,
        supabase,
      });
      expect(result).toBeNull();
    });
  });

  describe("entity = job", () => {
    it("prefecture のみ (municipality = null) → 同県内全レコード ID", async () => {
      const supabase = buildSupabase({
        job_areas: [
          {
            data: [
              { job_id: "j1" },
              { job_id: "j2" },
              { job_id: "j1" }, // 重複
            ],
            error: null,
          },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "job",
        prefecture: "東京都",
        municipality: null,
        supabase,
      });
      expect(result).toEqual(expect.arrayContaining(["j1", "j2"]));
      expect(result?.length).toBe(2);
    });

    it("prefecture + municipality → exact + 県全域 (上位包含)", async () => {
      const supabase = buildSupabase({
        job_areas: [
          // 1st: exact (prefecture + municipality)
          { data: [{ job_id: "exact1" }, { job_id: "shared" }], error: null },
          // 2nd: full pref (municipality IS NULL)
          { data: [{ job_id: "full1" }, { job_id: "shared" }], error: null },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "job",
        prefecture: "東京都",
        municipality: "港区",
        supabase,
      });
      expect(result?.sort()).toEqual(["exact1", "full1", "shared"].sort());
    });

    it("両 query エラー → 空配列", async () => {
      const supabase = buildSupabase({
        job_areas: [
          { data: null, error: { message: "boom" } },
          { data: null, error: { message: "boom" } },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "job",
        prefecture: "東京都",
        municipality: "港区",
        supabase,
      });
      expect(result).toEqual([]);
    });

    it("空配列の結果はそのまま空配列で返る (マッチなし)", async () => {
      const supabase = buildSupabase({
        job_areas: [
          { data: [], error: null },
          { data: [], error: null },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "job",
        prefecture: "北海道",
        municipality: "札幌市中央区",
        supabase,
      });
      expect(result).toEqual([]);
    });
  });

  describe("entity = client", () => {
    it("client_recruit_areas に対して同じパターンで動作", async () => {
      const supabase = buildSupabase({
        client_recruit_areas: [
          { data: [{ client_id: "c1" }], error: null },
          { data: [{ client_id: "c2" }], error: null },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "client",
        prefecture: "東京都",
        municipality: "港区",
        supabase,
      });
      expect(result?.sort()).toEqual(["c1", "c2"]);
    });

    it("prefecture のみ → 県内全 client_id", async () => {
      const supabase = buildSupabase({
        client_recruit_areas: [
          { data: [{ client_id: "c1" }, { client_id: "c1" }], error: null },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "client",
        prefecture: "東京都",
        municipality: null,
        supabase,
      });
      expect(result).toEqual(["c1"]);
    });
  });

  describe("entity = user", () => {
    it("user_available_areas に対して同じパターンで動作", async () => {
      const supabase = buildSupabase({
        user_available_areas: [
          { data: [{ user_id: "u1" }], error: null },
          { data: [{ user_id: "u2" }], error: null },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "user",
        prefecture: "東京都",
        municipality: "港区",
        supabase,
      });
      expect(result?.sort()).toEqual(["u1", "u2"]);
    });

    it("NULL municipality のレコード (県全域) を含めた上位包含が機能する", async () => {
      // user1: 県全域 (full pref) のみ登録
      // user2: 港区 のみ登録
      // user3: 港区 と 県全域 両方
      // → 港区で検索すると user1, user2, user3 全員ヒット
      const supabase = buildSupabase({
        user_available_areas: [
          // exact (港区)
          { data: [{ user_id: "u2" }, { user_id: "u3" }], error: null },
          // full pref (NULL)
          { data: [{ user_id: "u1" }, { user_id: "u3" }], error: null },
        ],
      }) as never;
      const result = await buildAreaFilterIds({
        entity: "user",
        prefecture: "東京都",
        municipality: "港区",
        supabase,
      });
      expect(result?.sort()).toEqual(["u1", "u2", "u3"]);
    });
  });
});
