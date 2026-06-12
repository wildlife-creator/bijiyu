import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-014 発注取消 Server Action のテスト（Task 10.2）。
 * - admin role 再チェック
 * - canAdminCancel の再評価（UI と同一関数。accepted＋初回稼働日前のみ）
 * - status='cancelled'＋cancelled_by='admin' 更新 + audit log（application_cancel_admin）
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

import { adminCancelApplicationAction } from "@/app/admin/(protected)/applications/[id]/actions";
import { getJstToday } from "@/lib/utils/format-date";

const ADMIN_ID = "99999999-9999-9999-9999-999999999999";
const APPLICATION_ID = "cccccccc-0000-1000-8000-000000000001";

/** JST 当日から offsetDays ずらした YYYY-MM-DD（境界値テスト用） */
function jstDateWithOffset(offsetDays: number): string {
  const base = new Date(`${getJstToday()}T00:00:00+09:00`);
  base.setDate(base.getDate() + offsetDays);
  return getJstToday(base);
}

beforeEach(() => {
  authState.user = { id: ADMIN_ID };
  authState.role = "admin";
  adminState.application = {
    id: APPLICATION_ID,
    status: "accepted",
    first_work_date: jstDateWithOffset(3),
  };
  adminState.updates = [];
  adminState.updateError = null;
  mockWriteAuditLog.mockClear();
});

describe("adminCancelApplicationAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "client";
    const result = await adminCancelApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("存在しない応募は拒否", async () => {
    adminState.application = null;
    const result = await adminCancelApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
  });

  it("applied（発注前）は取消不可", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "applied",
      first_work_date: null,
    };
    const result = await adminCancelApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("accepted でも初回稼働日を過ぎていたら取消不可（canAdminCancel 再評価）", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "accepted",
      first_work_date: jstDateWithOffset(-1),
    };
    const result = await adminCancelApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("成功: cancelled + cancelled_by='admin' + audit log（当日稼働日も取消可）", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "accepted",
      first_work_date: jstDateWithOffset(0),
    };

    const result = await adminCancelApplicationAction(APPLICATION_ID);

    expect(result.success).toBe(true);
    const update = adminState.updates.find((u) => u.table === "applications");
    expect(update?.payload).toEqual({
      status: "cancelled",
      cancelled_by: "admin",
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "application_cancel_admin",
        actorId: ADMIN_ID,
        targetId: APPLICATION_ID,
      }),
    );
  });

  it("first_work_date 未確定（null）の accepted は取消可", async () => {
    adminState.application = {
      id: APPLICATION_ID,
      status: "accepted",
      first_work_date: null,
    };
    const result = await adminCancelApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(true);
  });

  it("DB 更新エラー時はエラーを返す（audit log なし）", async () => {
    adminState.updateError = { message: "db down" };
    const result = await adminCancelApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(false);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});
