import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * updateVideoUrlAction / updateWorkplaceVideoUrlAction の統合テスト
 * （video-display Task 5.5、書き込み + 権限系のためフルテスト）。
 *
 * Server Action 自体はモックせず内部ロジックを実行する。Supabase クライアントを
 * モックし `{ data, error }` 形状を再現。admin / 一般ユーザー / staff の三重防御を確認。
 */

const authState = {
  user: null as null | { id: string },
  actorRole: "admin" as "admin" | "contractor" | "client" | "staff" | null,
};

interface AdminUpdateLog {
  table: string;
  payload: Record<string, unknown>;
  matchColumn: string;
  matchValue: unknown;
}

const adminState = {
  updates: [] as AdminUpdateLog[],
  updateError: null as null | { message: string },
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.actorRole ? { role: authState.actorRole } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (matchColumn: string, matchValue: unknown) => {
          adminState.updates.push({ table, payload, matchColumn, matchValue });
          return Promise.resolve({
            data: null,
            error: adminState.updateError,
          });
        },
      }),
      insert: (payload: Record<string, unknown>) => {
        adminState.inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { updateVideoUrlAction, updateWorkplaceVideoUrlAction } = await import(
  "@/app/admin/actions"
);

function fd(userId: string, url: string): FormData {
  const f = new FormData();
  f.set("userId", userId);
  f.set("url", url);
  return f;
}

beforeEach(() => {
  authState.user = { id: "admin-1" };
  authState.actorRole = "admin";
  adminState.updates = [];
  adminState.updateError = null;
  adminState.inserts = [];
});

/** audit_logs への INSERT のみを抽出する */
function auditInserts() {
  return adminState.inserts.filter((i) => i.table === "audit_logs");
}

describe("updateVideoUrlAction (ADM-010, users.video_url)", () => {
  it("有効な TikTok URL で users.video_url を更新する", async () => {
    const result = await updateVideoUrlAction(
      fd("user-9", "https://www.tiktok.com/@u/video/7234567890123456789"),
    );
    expect(result.success).toBe(true);
    expect(adminState.updates).toHaveLength(1);
    expect(adminState.updates[0]).toMatchObject({
      table: "users",
      payload: { video_url: "https://www.tiktok.com/@u/video/7234567890123456789" },
      matchColumn: "id",
      matchValue: "user-9",
    });
  });

  it("空文字入力で video_url を NULL に更新する（掲載停止）", async () => {
    const result = await updateVideoUrlAction(fd("user-9", ""));
    expect(result.success).toBe(true);
    expect(adminState.updates[0]?.payload).toEqual({ video_url: null });
  });

  it("不正な URL は拒否し DB 更新しない", async () => {
    const result = await updateVideoUrlAction(
      fd("user-9", "https://vt.tiktok.com/ZSabc/"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("対応プラットフォームの URL を入力してください");
    }
    expect(adminState.updates).toHaveLength(0);
  });

  it("DB エラー時は success:false を返す", async () => {
    adminState.updateError = { message: "boom" };
    const result = await updateVideoUrlAction(
      fd("user-9", "https://www.tiktok.com/@u/video/123"),
    );
    expect(result.success).toBe(false);
  });
});

describe("updateWorkplaceVideoUrlAction (ADM-010B, client_profiles.workplace_video_url)", () => {
  it("有効な URL で client_profiles.workplace_video_url を更新する", async () => {
    const result = await updateWorkplaceVideoUrlAction(
      fd("user-7", "https://www.tiktok.com/@c/video/999"),
    );
    expect(result.success).toBe(true);
    expect(adminState.updates[0]).toMatchObject({
      table: "client_profiles",
      payload: { workplace_video_url: "https://www.tiktok.com/@c/video/999" },
      matchColumn: "user_id",
      matchValue: "user-7",
    });
  });

  it("空文字で NULL 更新", async () => {
    const result = await updateWorkplaceVideoUrlAction(fd("user-7", ""));
    expect(result.success).toBe(true);
    expect(adminState.updates[0]?.payload).toEqual({
      workplace_video_url: null,
    });
  });
});

describe("監査ログ（video_url_update・admin spec Task 3.2）", () => {
  it("PR動画の更新成功時に audit log を記録する", async () => {
    const result = await updateVideoUrlAction(
      fd("user-9", "https://www.tiktok.com/@u/video/123"),
    );
    expect(result.success).toBe(true);
    expect(auditInserts()).toHaveLength(1);
    expect(auditInserts()[0].payload).toMatchObject({
      action: "video_url_update",
      actor_id: "admin-1",
      target_id: "user-9",
    });
  });

  it("職場紹介動画の更新成功時に audit log を記録する", async () => {
    const result = await updateWorkplaceVideoUrlAction(
      fd("user-7", "https://www.tiktok.com/@c/video/999"),
    );
    expect(result.success).toBe(true);
    expect(auditInserts()).toHaveLength(1);
    expect(auditInserts()[0].payload).toMatchObject({
      action: "video_url_update",
      target_id: "user-7",
    });
  });

  it("バリデーション失敗時は audit log を記録しない", async () => {
    await updateVideoUrlAction(fd("user-9", "https://vt.tiktok.com/ZSabc/"));
    expect(auditInserts()).toHaveLength(0);
  });

  it("DB 更新失敗時は audit log を記録しない", async () => {
    adminState.updateError = { message: "boom" };
    await updateVideoUrlAction(
      fd("user-9", "https://www.tiktok.com/@u/video/123"),
    );
    expect(auditInserts()).toHaveLength(0);
  });
});

describe("三重防御: 認可チェック", () => {
  it("未ログインは拒否", async () => {
    authState.user = null;
    const result = await updateVideoUrlAction(
      fd("user-9", "https://www.tiktok.com/@u/video/123"),
    );
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("一般ユーザー（contractor）は拒否", async () => {
    authState.actorRole = "contractor";
    const result = await updateVideoUrlAction(
      fd("user-9", "https://www.tiktok.com/@u/video/123"),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("権限がありません");
    }
    expect(adminState.updates).toHaveLength(0);
  });

  it("staff は拒否", async () => {
    authState.actorRole = "staff";
    const result = await updateWorkplaceVideoUrlAction(
      fd("user-7", "https://www.tiktok.com/@c/video/123"),
    );
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });

  it("userId 未指定は拒否", async () => {
    const result = await updateVideoUrlAction(
      fd("", "https://www.tiktok.com/@u/video/123"),
    );
    expect(result.success).toBe(false);
    expect(adminState.updates).toHaveLength(0);
  });
});
