import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { fetchMyPrivateProfile, fetchUserAges } from "@/lib/users/private-fields";

const mockRpc = vi.fn();
const supabase = { rpc: mockRpc } as unknown as SupabaseClient<Database>;

beforeEach(() => {
  mockRpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchMyPrivateProfile", () => {
  it("本人の非公開列を返す", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          email: "me@test.local",
          birth_date: "1990-05-15",
          password_set_at: "2026-09-29T00:00:00Z",
        },
      ],
      error: null,
    });

    const result = await fetchMyPrivateProfile(supabase);

    expect(mockRpc).toHaveBeenCalledWith("get_my_private_profile");
    expect(result).toEqual({
      email: "me@test.local",
      birthDate: "1990-05-15",
      passwordSetAt: "2026-09-29T00:00:00Z",
    });
  });

  it("行が無い（未ログイン等）ときは null", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchMyPrivateProfile(supabase)).toBeNull();
  });

  it("エラーのときは null", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await fetchMyPrivateProfile(supabase)).toBeNull();
  });
});

describe("fetchUserAges", () => {
  it("user_id → 年齢の Map を返し、生年月日未登録（age = null）は含めない", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { user_id: "u1", age: 35 },
        { user_id: "u2", age: null },
      ],
      error: null,
    });

    const ages = await fetchUserAges(supabase, ["u1", "u2", "u1"]);

    expect(mockRpc).toHaveBeenCalledWith("get_user_ages", { p_user_ids: ["u1", "u2"] });
    expect(ages.get("u1")).toBe(35);
    expect(ages.has("u2")).toBe(false);
  });

  it("ID が空なら RPC を呼ばない", async () => {
    const ages = await fetchUserAges(supabase, []);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(ages.size).toBe(0);
  });

  it("エラーのときは空の Map（年齢を出さずに画面は描画する）", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const ages = await fetchUserAges(supabase, ["u1"]);
    expect(ages.size).toBe(0);
  });
});
