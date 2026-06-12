import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-004/005 の Server Action テスト。
 * - updateAdminMemoAction: admin role 再チェック・2000字上限・audit log（admin_memo_update）
 * - deleteClientAccountAction: 対象ガード（role=client・未削除）・executeWithdrawal 委譲・
 *   audit log（account_delete・metadata に cascade 対象数）・ガードエラーの表示
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
  profileRow: null as null | { id: string },
  orgRow: null as null | { id: string },
  memberCount: 0,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updateError: null as null | { message: string },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn((_cols?: string, opts?: { head?: boolean }) => {
          if (opts?.head) {
            Object.defineProperty(chain, "then", {
              configurable: true,
              value: (resolve: (v: unknown) => void) =>
                resolve({ count: adminState.memberCount, error: null }),
            });
          }
          return chain;
        }),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => {
          adminState.updates.push({ table, payload });
          return chain;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          adminState.inserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "users") {
            return { data: adminState.targetUser, error: null };
          }
          if (table === "client_profiles") {
            return { data: adminState.profileRow, error: null };
          }
          if (table === "organizations") {
            return { data: adminState.orgRow, error: null };
          }
          return { data: null, error: null };
        }),
      };
      Object.defineProperty(chain, "then", {
        configurable: true,
        value: (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: adminState.updateError }),
      });
      return chain;
    },
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

import {
  deleteClientAccountAction,
  updateAdminMemoAction,
} from "@/app/admin/(protected)/clients/[id]/actions";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";
const TARGET_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  authState.user = { id: ADMIN_ID };
  authState.role = "admin";
  adminState.targetUser = {
    id: TARGET_ID,
    role: "client",
    deleted_at: null,
  };
  adminState.profileRow = { id: "profile-1" };
  adminState.orgRow = null;
  adminState.memberCount = 0;
  adminState.updates = [];
  adminState.inserts = [];
  adminState.updateError = null;
  mockExecuteWithdrawal.mockReset().mockResolvedValue({ success: true });
  mockWriteAuditLog.mockClear();
  mockRedirect.mockClear();
});

function memoFormData(memo: string): FormData {
  const fd = new FormData();
  fd.set("adminMemo", memo);
  return fd;
}

describe("updateAdminMemoAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "client";
    const result = await updateAdminMemoAction(TARGET_ID, memoFormData("メモ"));
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("2000字超はバリデーションエラー", async () => {
    const result = await updateAdminMemoAction(
      TARGET_ID,
      memoFormData("あ".repeat(2001)),
    );
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("成功: client_profiles.admin_memo 更新 + audit log + ADM-004 へ redirect", async () => {
    await expect(
      updateAdminMemoAction(TARGET_ID, memoFormData("対応履歴メモ")),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/clients/${TARGET_ID}`);

    expect(
      adminState.updates.some(
        (u) =>
          u.table === "client_profiles" && u.payload.admin_memo === "対応履歴メモ",
      ),
    ).toBe(true);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_memo_update",
        actorId: ADMIN_ID,
        targetId: TARGET_ID,
      }),
    );
  });

  it("空文字（メモ削除）は許容される", async () => {
    await expect(
      updateAdminMemoAction(TARGET_ID, memoFormData("")),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(
      adminState.updates.some(
        (u) => u.table === "client_profiles" && u.payload.admin_memo === null,
      ),
    ).toBe(true);
  });
});

describe("deleteClientAccountAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "staff";
    const result = await deleteClientAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("対象が client 以外なら拒否", async () => {
    adminState.targetUser = { id: TARGET_ID, role: "contractor", deleted_at: null };
    const result = await deleteClientAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("削除済みの対象は拒否", async () => {
    adminState.targetUser = {
      id: TARGET_ID,
      role: "client",
      deleted_at: "2026-06-01T00:00:00Z",
    };
    const result = await deleteClientAccountAction(TARGET_ID);
    expect(result.success).toBe(false);
    expect(mockExecuteWithdrawal).not.toHaveBeenCalled();
  });

  it("成功: executeWithdrawal(admin・survey なし) + audit log + 一覧へ redirect", async () => {
    adminState.orgRow = { id: "org-1" };
    adminState.memberCount = 3;

    await expect(deleteClientAccountAction(TARGET_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/clients",
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
        metadata: expect.objectContaining({ cascade_member_count: 3 }),
      }),
    );
  });

  it("進行中取引ガードで拒否されたらエラー文言をそのまま返す", async () => {
    mockExecuteWithdrawal.mockResolvedValue({
      success: false,
      error: "受注者が作業中の案件があるため退会できません。案件の完了後に再度お試しください。",
    });

    const result = await deleteClientAccountAction(TARGET_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("受注者が作業中の案件があるため");
    }
    expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "account_delete" }),
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
