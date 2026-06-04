import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  summarizeReputation,
  fetchClientReputation,
} from "@/lib/client-review/aggregate";

type Resolved = { data: unknown; error: unknown };

/** .from().select().eq() が {data,error} を返すモック */
function mockEqClient(resolved: Resolved) {
  const eq = vi.fn(() => Promise.resolve(resolved));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, select, eq };
}

describe("summarizeReputation（純粋関数）", () => {
  it("good のみ: goodCount=total", () => {
    expect(
      summarizeReputation([
        { rating_again: "good" },
        { rating_again: "good" },
        { rating_again: "good" },
      ]),
    ).toEqual({ goodCount: 3, total: 3 });
  });

  it("good+bad 混在: total は good+bad、goodCount は good のみ", () => {
    expect(
      summarizeReputation([
        { rating_again: "good" },
        { rating_again: "bad" },
        { rating_again: "good" },
      ]),
    ).toEqual({ goodCount: 2, total: 3 });
  });

  it("空配列: {0,0}", () => {
    expect(summarizeReputation([])).toEqual({ goodCount: 0, total: 0 });
  });

  it("null 混在: null は分母（total）から除外する", () => {
    expect(
      summarizeReputation([
        { rating_again: "good" },
        { rating_again: null },
        { rating_again: "bad" },
        { rating_again: null },
      ]),
    ).toEqual({ goodCount: 1, total: 2 });
  });

  it("常に goodCount <= total を満たす（bad のみでも goodCount=0）", () => {
    const s = summarizeReputation([
      { rating_again: "bad" },
      { rating_again: "bad" },
    ]);
    expect(s).toEqual({ goodCount: 0, total: 2 });
    expect(s.goodCount).toBeLessThanOrEqual(s.total);
  });
});

describe("fetchClientReputation（取得関数）", () => {
  it("組織スコープ: 取得行を集計して返す", async () => {
    const { client } = mockEqClient({
      data: [
        { rating_again: "good" },
        { rating_again: "good" },
        { rating_again: "bad" },
      ],
      error: null,
    });
    expect(
      await fetchClientReputation(client, {
        kind: "organization",
        organizationId: "org1",
      }),
    ).toEqual({ goodCount: 2, total: 3 });
  });

  it("個人スコープ: 取得行を集計して返す", async () => {
    const { client } = mockEqClient({
      data: [{ rating_again: "good" }, { rating_again: "bad" }],
      error: null,
    });
    expect(
      await fetchClientReputation(client, {
        kind: "individual",
        clientUserId: "client1",
      }),
    ).toEqual({ goodCount: 1, total: 2 });
  });

  it("0件: {0,0} を返す", async () => {
    const { client } = mockEqClient({ data: [], error: null });
    expect(
      await fetchClientReputation(client, {
        kind: "individual",
        clientUserId: "client1",
      }),
    ).toEqual({ goodCount: 0, total: 0 });
  });

  it("error 時: fail-safe で {0,0} を返す（例外を投げない）", async () => {
    const { client } = mockEqClient({ data: null, error: { message: "boom" } });
    expect(
      await fetchClientReputation(client, {
        kind: "organization",
        organizationId: "org1",
      }),
    ).toEqual({ goodCount: 0, total: 0 });
  });

  it("個人スコープ: reviewee_id で client_reviews を引く", async () => {
    const { client, from, select, eq } = mockEqClient({
      data: [{ rating_again: "good" }],
      error: null,
    });
    await fetchClientReputation(client, {
      kind: "individual",
      clientUserId: "client-xyz",
    });
    expect(from).toHaveBeenCalledWith("client_reviews");
    expect(select).toHaveBeenCalledWith("rating_again");
    expect(eq).toHaveBeenCalledWith("reviewee_id", "client-xyz");
  });

  it("組織スコープ: organization_id で client_reviews を引く", async () => {
    const { client, from, select, eq } = mockEqClient({
      data: [{ rating_again: "good" }],
      error: null,
    });
    await fetchClientReputation(client, {
      kind: "organization",
      organizationId: "org-abc",
    });
    expect(from).toHaveBeenCalledWith("client_reviews");
    expect(select).toHaveBeenCalledWith("rating_again");
    expect(eq).toHaveBeenCalledWith("organization_id", "org-abc");
  });
});
