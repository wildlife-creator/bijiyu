import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  fetchOverallSummary,
  fetchPerItemSummary,
  fetchBulkOverallSummary,
} from "@/lib/rating/aggregate";

type Resolved = { data: unknown; error: unknown };

/** .from().select().eq() が {data,error} を返すモック */
function mockEqClient(resolved: Resolved) {
  const eq = vi.fn(() => Promise.resolve(resolved));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, select, eq };
}

/** .from().select().in() が {data,error} を返すモック */
function mockInClient(resolved: Resolved) {
  const inFn = vi.fn(() => Promise.resolve(resolved));
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, select, in: inFn };
}

describe("fetchOverallSummary", () => {
  it("複数件の平均と件数を返す", async () => {
    const { client } = mockEqClient({
      data: [{ rating_overall: 5 }, { rating_overall: 4 }, { rating_overall: 3 }],
      error: null,
    });
    expect(await fetchOverallSummary(client, "u1")).toEqual({ avg: 4.0, count: 3 });
  });

  it("0件なら avg=null, count=0", async () => {
    const { client } = mockEqClient({ data: [], error: null });
    expect(await fetchOverallSummary(client, "u1")).toEqual({ avg: null, count: 0 });
  });

  it("error 時は fail-soft で avg=null, count=0", async () => {
    const { client } = mockEqClient({ data: null, error: { message: "boom" } });
    expect(await fetchOverallSummary(client, "u1")).toEqual({ avg: null, count: 0 });
  });

  it("平均は小数2桁に丸める", async () => {
    const { client } = mockEqClient({
      data: [{ rating_overall: 5 }, { rating_overall: 4 }, { rating_overall: 4 }],
      error: null,
    });
    // (5+4+4)/3 = 4.333... → 4.33
    expect(await fetchOverallSummary(client, "u1")).toEqual({ avg: 4.33, count: 3 });
  });
});

describe("fetchPerItemSummary", () => {
  it("任意項目は NULL を分母から除外する", async () => {
    const { client } = mockEqClient({
      data: [
        {
          rating_overall: 5,
          rating_punctual: 5,
          rating_follows_instructions: null,
          rating_speed: 3,
          rating_quality: 4,
          rating_has_tools: null,
          rating_has_special_equipment: null,
        },
        {
          rating_overall: 3,
          rating_punctual: null,
          rating_follows_instructions: 4,
          rating_speed: 1,
          rating_quality: 4,
          rating_has_tools: null,
          rating_has_special_equipment: null,
        },
      ],
      error: null,
    });
    const s = await fetchPerItemSummary(client, "u1");
    expect(s.overall).toEqual({ avg: 4.0, count: 2 }); // (5+3)/2
    expect(s.punctual).toEqual({ avg: 5.0, count: 1 }); // 5 のみ
    expect(s.followsInstructions).toEqual({ avg: 4.0, count: 1 }); // 4 のみ
    expect(s.speed).toEqual({ avg: 2.0, count: 2 }); // (3+1)/2
    expect(s.quality).toEqual({ avg: 4.0, count: 2 });
    expect(s.hasTools).toEqual({ avg: null, count: 0 }); // 全 NULL → 未評価
    expect(s.hasSpecialEquipment).toEqual({ avg: null, count: 0 });
  });

  it("0件なら全項目 avg=null, count=0", async () => {
    const { client } = mockEqClient({ data: [], error: null });
    const s = await fetchPerItemSummary(client, "u1");
    expect(s.overall).toEqual({ avg: null, count: 0 });
    expect(s.hasSpecialEquipment).toEqual({ avg: null, count: 0 });
  });
});

describe("fetchBulkOverallSummary", () => {
  it("reviewee_id ごとに集計した Map を返す", async () => {
    const { client } = mockInClient({
      data: [
        { reviewee_id: "a", rating_overall: 5 },
        { reviewee_id: "a", rating_overall: 4 },
        { reviewee_id: "a", rating_overall: 3 },
        { reviewee_id: "b", rating_overall: 4 },
      ],
      error: null,
    });
    const map = await fetchBulkOverallSummary(client, ["a", "b"]);
    expect(map.get("a")).toEqual({ avg: 4.0, count: 3 });
    expect(map.get("b")).toEqual({ avg: 4.0, count: 1 });
  });

  it("評価0件の userId は Map に含まれない", async () => {
    const { client } = mockInClient({
      data: [{ reviewee_id: "a", rating_overall: 5 }],
      error: null,
    });
    const map = await fetchBulkOverallSummary(client, ["a", "b"]);
    expect(map.has("b")).toBe(false);
  });

  it("空の userIds ならクエリせず空 Map を返す", async () => {
    const { client, from } = mockInClient({ data: [], error: null });
    const map = await fetchBulkOverallSummary(client, []);
    expect(map.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("error 時は空 Map を返す（fail-soft）", async () => {
    const { client } = mockInClient({ data: null, error: { message: "boom" } });
    const map = await fetchBulkOverallSummary(client, ["a"]);
    expect(map.size).toBe(0);
  });
});
