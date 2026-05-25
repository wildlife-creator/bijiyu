import { describe, expect, it, vi } from "vitest";

import { hasActiveOption } from "@/lib/billing/options";

/**
 * option_subscriptions を user_id + option_type + status='active' で存在チェック
 * する hasActiveOption の単体テスト。Supabase クライアントの `{ data, error }`
 * 形状を正確に再現し、正常系・異常系の両方を検証する。
 */

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

function makeClient(result: FakeResult) {
  const filters: Record<string, unknown> = {};
  const chain = {
    _filters: filters,
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  const client = {
    from: vi.fn(() => chain),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, chain };
}

describe("hasActiveOption", () => {
  it("active なレコードが 1 件以上あれば true", async () => {
    const { client, chain } = makeClient({
      data: [{ id: "opt-1" }],
      error: null,
    });
    const result = await hasActiveOption(client, "user-1", "video");
    expect(result).toBe(true);
    // status='active' / option_type / user_id で絞り込んでいること
    expect(chain._filters).toMatchObject({
      user_id: "user-1",
      option_type: "video",
      status: "active",
    });
  });

  it("cancelled / expired は active 絞り込みで対象外 → 空配列 → false", async () => {
    // status='active' フィルタを通すので DB 側で cancelled/expired は返らない。
    // ここでは「該当 active 無し = 空配列」を再現して false を確認。
    const { client } = makeClient({ data: [], error: null });
    const result = await hasActiveOption(client, "user-1", "video_workplace");
    expect(result).toBe(false);
  });

  it("該当 option_type の active が無ければ false", async () => {
    const { client } = makeClient({ data: [], error: null });
    const result = await hasActiveOption(client, "user-1", "video");
    expect(result).toBe(false);
  });

  it("error が返った場合は false（フェイルセーフで非表示）", async () => {
    const { client } = makeClient({
      data: null,
      error: { message: "permission denied" },
    });
    const result = await hasActiveOption(client, "user-1", "video");
    expect(result).toBe(false);
  });

  it("data が null（行なし）でも false", async () => {
    const { client } = makeClient({ data: null, error: null });
    const result = await hasActiveOption(client, "user-1", "video_workplace");
    expect(result).toBe(false);
  });
});
