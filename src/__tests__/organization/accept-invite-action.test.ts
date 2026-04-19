import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockAuthUpdateUser = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockAuthUpdateUser(...args),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

import { acceptInviteAction } from "@/app/(auth)/accept-invite/confirm/actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface Terminator {
  thenable?: { data?: unknown; error?: unknown };
}

function createQueryMock(t: Terminator = {}) {
  const chain: Record<string, unknown> = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };
  if (t.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: t.thenable?.data ?? null, error: t.thenable?.error ?? null }),
    });
  }
  return chain;
}

describe("acceptInviteAction", () => {
  it("弱いパスワード（8 文字未満）はバリデーションエラー", async () => {
    const r = await acceptInviteAction({
      password: "abc12",
      confirmPassword: "abc12",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("入力内容を確認してください");
  });

  it("パスワード不一致はバリデーションエラー", async () => {
    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd5678",
    });
    expect(r.success).toBe(false);
  });

  it("未認証（セッション無し）は期限切れエラー", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("有効期限が切れています");
  });

  it("updateUser で expired エラーは期限切れメッセージ", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({
      error: { message: "Token has expired" },
    });
    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("有効期限が切れています");
  });

  it("正常系: password 更新 + password_set_at UPDATE + /mypage redirect", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    const updateChain = createQueryMock({ thenable: { data: null, error: null } });
    mockAdminFrom.mockReturnValueOnce(updateChain);

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/mypage");
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ password_set_at: expect.any(String) }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith("id", "u1");
  });
});
