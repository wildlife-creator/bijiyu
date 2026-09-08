import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-014 「完了扱いにする」Server Action のテスト（ステージング指摘 No.8）。
 * - admin role 再チェック
 * - canAdminResolveExpired の再評価（UI と同一関数。accepted＋稼働終了日+5日を過ぎたもののみ）
 * - status='completed' 更新 + audit log（application_complete_admin, reason=review_window_expired）
 * - 通知メールは送らない（運営が当事者連絡する運用）
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
  application: null as null | Record<string, unknown>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updateError: null as null | { message: string },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => {
          adminState.updates.push({ table, payload });
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({
          data: adminState.application,
          error: null,
        })),
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

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { adminCompleteApplicationAction } from "@/app/admin/(protected)/applications/[id]/actions";
import { getJstToday } from "@/lib/utils/format-date";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";
const APPLICATION_ID = "cccccccc-0000-1000-8000-000000000002";

function jstDateWithOffset(offsetDays: number): string {
  const base = new Date(`${getJstToday()}T00:00:00+09:00`);
  base.setDate(base.getDate() + offsetDays);
  return getJstToday(base);
}

beforeEach(() => {
  authState.user = { id: ADMIN_ID };
  authState.role = "admin";
  // 既定: 期限切れ（稼働終了 10 日前 → 期限は 5 日前 → 過ぎている）
  adminState.application = {
    id: APPLICATION_ID,
    status: "accepted",
    first_work_date: jstDateWithOffset(-18),
    job: { work_end_date: jstDateWithOffset(-10) },
  };
  adminState.updates = [];
  adminState.updateError = null;
  mockWriteAuditLog.mockClear();
});

describe("adminCompleteApplicationAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "client";
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("存在しない応募は拒否", async () => {
    adminState.application = null;
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
  });

  it("成功: 期限切れ accepted を completed にし audit log を記録する", async () => {
    const result = await adminCompleteApplicationAction(APPLICATION_ID);

    expect(result.success).toBe(true);
    const update = adminState.updates.find((u) => u.table === "applications");
    expect(update?.payload).toEqual({ status: "completed" });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "application_complete_admin",
        actorId: ADMIN_ID,
        targetType: "applications",
        targetId: APPLICATION_ID,
        metadata: { reason: "review_window_expired" },
      }),
    );
  });

  it("期限内（稼働終了日+5日の当日）は当事者が完了報告できるので拒否", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "accepted",
      first_work_date: jstDateWithOffset(-10),
      job: { work_end_date: jstDateWithOffset(-5) },
    };
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("初回稼働日前の accepted は拒否（発注取消の領域）", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "accepted",
      first_work_date: jstDateWithOffset(5),
      job: { work_end_date: jstDateWithOffset(10) },
    };
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
  });

  it("稼働終了日が未設定の案件は拒否（期限が決まらない）", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "accepted",
      first_work_date: jstDateWithOffset(-18),
      job: { work_end_date: null },
    };
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
  });

  it("accepted 以外（completed 済み等）は拒否", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "completed",
      first_work_date: jstDateWithOffset(-18),
      job: { work_end_date: jstDateWithOffset(-10) },
    };
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
  });

  it("DB 更新エラー時はエラーを返す（audit log なし）", async () => {
    adminState.updateError = { message: "db down" };
    const result = await adminCompleteApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});
