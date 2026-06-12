import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-009 の Server Action テスト（Task 8.3）。
 * - deleteUserAccountAction: admin role 再チェック・対象ガード
 *   （contractor のみ削除可。client は ADM-004 への一本化のため拒否＝UI と二重防御）・
 *   executeWithdrawal 委譲・audit log（account_delete）・ガードエラーの表示
 */

const authState = {
  user: null as null | { id: string },
  role: "admin" as string | null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
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

const adminState = {
  targetUser: null as null | Record<string, unknown>,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: adminState.targetUser,
        error: null,
      })),
    }),
  }),
}));

const mockExecuteWithdrawal = vi.fn();
vi.mock("@/lib/withdrawal/execute", () => ({
  executeWithdrawal: (...args: unknown[]) => mockExecuteWithdrawal(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deleteUserAccountAction } from "@/app/admin/(protected)/users/[id]/actions";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";
const TARGET_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  authState.user = { id: ADMIN_ID };
  authState.role = "admin";
  adminState.targetUser = {
    id: TARGET_ID,
    role: "contractor",
    deleted_at: null,
  };
  mockExecuteWithdrawal.mockReset().mockResolvedValue({ success: true });
  mockWriteAuditLog.mockClear();
  mockRedirect.mockClear();
});

describe("deleteUserAccountAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "client";
    const result = await deleteUserAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("対象が client の場合は拒否（削除は ADM-004 に一本化・UI と二重防御）", async () => {
    adminState.targetUser = { id: TARGET_ID, role: "client", deleted_at: null };
    const result = await deleteUserAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("発注者");
    }
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("対象が staff / admin の場合も拒否（contractor のみ削除可）", async () => {
    adminState.targetUser = { id: TARGET_ID, role: "staff", deleted_at: null };
    const result = await deleteUserAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("存在しない対象は拒否", async () => {
    adminState.targetUser = null;
    const result = await deleteUserAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("削除済みの対象は拒否", async () => {
    adminState.targetUser = {
      id: TARGET_ID,
      role: "contractor",
      deleted_at: "2026-06-01T00:00:00Z",
    };
    const result = await deleteUserAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("成功: executeWithdrawal(admin・survey なし) + audit log + 一覧へ redirect", async () => {
    await expect(deleteUserAccountAction(TARGET_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/users",
    );

    expect(mockExecuteWithdrawal).toHaveBeenCalledWith({
      targetUserId: TARGET_ID,
      recordSurvey: null,
      cancelledBy: "admin",
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account_delete",
        actorId: ADMIN_ID,
        targetId: TARGET_ID,
      }),
    );
  });

  it("進行中取引ガードで拒否されたらエラー文言をそのまま返す（audit/redirect なし）", async () => {
    mockExecuteWithdrawal.mockResolvedValue({
      success: false,
      error:
        "進行中の応募があるため退会できません。取引の完了後に再度お試しください。",
    });

    const result = await deleteUserAccountAction(TARGET_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("進行中の応募があるため");
    }
    expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "account_delete" }),
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
