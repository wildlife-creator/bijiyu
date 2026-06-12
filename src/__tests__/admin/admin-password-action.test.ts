import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * changeAdminPasswordAction（ADM-015 管理者パスワード変更）のテスト。
 * - admin role 再チェック（非 admin 拒否）
 * - signInWithPassword による現在のパスワード照合
 * - updateUser での更新 + audit log（admin_password_change）
 */

const authState = {
  user: null as null | { id: string; email?: string },
  role: "admin" as string | null,
};

const mockSignInWithPassword = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.role ? { role: authState.role } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

import { changeAdminPasswordAction } from "@/app/admin/(protected)/password/actions";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";

function buildFormData(
  overrides: Partial<Record<string, string>> = {},
): FormData {
  const fd = new FormData();
  fd.set("currentPassword", overrides.currentPassword ?? "oldpass123");
  fd.set("newPassword", overrides.newPassword ?? "newpass456");
  fd.set("confirmPassword", overrides.confirmPassword ?? "newpass456");
  return fd;
}

beforeEach(() => {
  authState.user = { id: ADMIN_ID, email: "admin@test.local" };
  authState.role = "admin";
  mockSignInWithPassword.mockReset().mockResolvedValue({
    data: { user: { id: ADMIN_ID } },
    error: null,
  });
  mockUpdateUser.mockReset().mockResolvedValue({
    data: { user: { id: ADMIN_ID } },
    error: null,
  });
  mockWriteAuditLog.mockClear();
});

describe("changeAdminPasswordAction", () => {
  it("未ログインは拒否", async () => {
    authState.user = null;
    const result = await changeAdminPasswordAction(buildFormData());
    expect(result.success).toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("非 admin は拒否", async () => {
    authState.role = "contractor";
    const result = await changeAdminPasswordAction(buildFormData());
    expect(result.success).toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("新パスワードが8文字未満はバリデーションエラー", async () => {
    const result = await changeAdminPasswordAction(
      buildFormData({ newPassword: "short", confirmPassword: "short" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("8文字以上");
    }
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("確認パスワード不一致はバリデーションエラー", async () => {
    const result = await changeAdminPasswordAction(
      buildFormData({ confirmPassword: "different456" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("一致しません");
    }
  });

  it("現在のパスワードが誤りの場合はエラー（updateUser は呼ばれない）", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await changeAdminPasswordAction(buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("現在のパスワードが正しくありません");
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("成功: 現在値照合 → updateUser → audit log（admin_password_change）", async () => {
    const result = await changeAdminPasswordAction(buildFormData());

    expect(result.success).toBe(true);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "admin@test.local",
      password: "oldpass123",
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newpass456" });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_password_change",
        actorId: ADMIN_ID,
        targetId: ADMIN_ID,
      }),
    );
  });

  it("updateUser が失敗したらエラーを返す", async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "update failed" },
    });

    const result = await changeAdminPasswordAction(buildFormData());

    expect(result.success).toBe(false);
    expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_password_change" }),
    );
  });
});
