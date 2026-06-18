import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * writeAuditLog（src/lib/audit/log.ts）のテスト。
 * - INSERT は createAdminClient()（service_role）で行うこと
 *   （audit_logs は INSERT ポリシーが無く、セッションクライアントからの
 *   INSERT は全件サイレント失敗する既存バグの再発防止）
 * - 失敗しても throw しない（監査の失敗で業務を止めない）
 */

const adminState = {
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  insertError: null as null | { message: string },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        adminState.inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: adminState.insertError });
      },
    }),
  }),
}));

import { writeAuditLog } from "@/lib/audit/log";

beforeEach(() => {
  adminState.inserts = [];
  adminState.insertError = null;
});

describe("writeAuditLog", () => {
  it("admin client 経由で audit_logs に INSERT する", async () => {
    await writeAuditLog({
      actorId: "11111111-1111-1111-1111-111111111111",
      action: "identity_approve",
      targetType: "identity_verifications",
      targetId: "22222222-2222-2222-2222-222222222222",
      metadata: { document_type: "identity" },
    });

    expect(adminState.inserts).toHaveLength(1);
    expect(adminState.inserts[0].table).toBe("audit_logs");
    expect(adminState.inserts[0].payload).toMatchObject({
      actor_id: "11111111-1111-1111-1111-111111111111",
      action: "identity_approve",
      target_type: "identity_verifications",
      target_id: "22222222-2222-2222-2222-222222222222",
      metadata: { document_type: "identity" },
    });
  });

  it("actorId が null・metadata 省略でも INSERT できる", async () => {
    await writeAuditLog({
      actorId: null,
      action: "auth.login.failure",
      targetType: "auth",
      targetId: "00000000-0000-0000-0000-000000000000",
    });

    expect(adminState.inserts).toHaveLength(1);
    expect(adminState.inserts[0].payload).toMatchObject({
      actor_id: null,
      metadata: null,
    });
  });

  it("INSERT が error を返しても throw しない", async () => {
    adminState.insertError = { message: "insert failed" };
    await expect(
      writeAuditLog({
        actorId: null,
        action: "auth.login.success",
        targetType: "auth",
        targetId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toBeUndefined();
  });

  it("admin client 自体が throw しても throw しない", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient);
    // from() で throw するケースを再現
    const broken = vi.spyOn(
      await import("@/lib/supabase/admin"),
      "createAdminClient",
    );
    broken.mockImplementationOnce(() => {
      throw new Error("connection error");
    });

    await expect(
      writeAuditLog({
        actorId: null,
        action: "auth.login.success",
        targetType: "auth",
        targetId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toBeUndefined();

    broken.mockRestore();
  });
});
