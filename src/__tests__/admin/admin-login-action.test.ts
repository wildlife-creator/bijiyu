import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * adminLoginAction（ADM-001 管理者専用ログイン）のテスト。
 * - 非 admin が正しい資格情報でログインしても signOut し、
 *   資格情報エラーと同一文言を返す（アカウント存在・権限の推測を防止）
 * - 成功 / 失敗とも audit log を記録する（失敗時メールはマスク）
 */

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  // maskEmail は実実装と同じ（メールマスクの検証が目的のため）
  maskEmail: (email: string) => {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***";
    return `${local[0]}***@${domain}`;
  },
}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { adminLoginAction } from "@/app/admin/login/actions";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";
const GENERIC_ERROR = "メールアドレスまたはパスワードが正しくありません";

function roleChain(role: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: role ? { role } : null, error: null }),
  };
}

function buildFormData(
  email = "admin@test.local",
  password = "testpass123",
): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

beforeEach(() => {
  mockSignInWithPassword.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockFrom.mockReset();
  mockWriteAuditLog.mockClear();
  mockRedirect.mockClear();
});

describe("adminLoginAction", () => {
  it("バリデーション不正はエラーを返す", async () => {
    const result = await adminLoginAction(buildFormData("not-an-email", ""));
    expect(result.success).toBe(false);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("資格情報が誤りの場合は汎用エラー + audit log（メールはマスク）", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await adminLoginAction(buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(GENERIC_ERROR);
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.failure",
        metadata: expect.objectContaining({
          email: "a***@test.local",
        }),
      }),
    );
  });

  it("非 admin が正しい資格情報でログインした場合: signOut + 資格情報エラーと同一文言", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
      error: null,
    });
    mockFrom.mockReturnValue(roleChain("contractor"));

    const result = await adminLoginAction(buildFormData("user@test.local"));

    expect(result.success).toBe(false);
    if (!result.success) {
      // 権限エラーではなく資格情報エラーと完全同一の文言（列挙防止）
      expect(result.error).toBe(GENERIC_ERROR);
    }
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.login.failure" }),
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("admin は成功し audit log 記録後 /admin/dashboard へ redirect する", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockFrom.mockReturnValue(roleChain("admin"));

    await expect(adminLoginAction(buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/dashboard",
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.success",
        actorId: ADMIN_ID,
        targetId: ADMIN_ID,
      }),
    );
  });
});
