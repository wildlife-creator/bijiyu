import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * submitTroubleReportAction の統合テスト（support Task 6.1）。
 * INSERT は通常クライアント（RLS 本人強制）、COUNT/UPDATE/DELETE は admin クライアント。
 */

const authState = { user: null as null | { id: string } };

const userState = {
  inserts: [] as Record<string, unknown>[],
  insertError: null as null | { message: string },
};

const adminState = {
  count: 0 as number | null,
  countError: null as null | { message: string },
  updateError: null as null | { message: string },
  updates: [] as Record<string, unknown>[],
  deletes: [] as unknown[],
};

const uploaderState = {
  result: { success: true, paths: [] as string[] } as
    | { success: true; paths: string[] }
    | { success: false; error: string },
  removed: [] as string[][],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      insert: async (payload: Record<string, unknown>) => {
        userState.inserts.push(payload);
        return { error: userState.insertError };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => ({
            count: adminState.count,
            error: adminState.countError,
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          adminState.updates.push(payload);
          return { error: adminState.updateError };
        },
      }),
      delete: () => ({
        eq: async (_col: string, val: unknown) => {
          adminState.deletes.push(val);
          return { error: null };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/support/attachments", () => ({
  uploadSupportAttachments: async () => uploaderState.result,
  removeSupportAttachments: async (paths: string[]) => {
    uploaderState.removed.push(paths);
  },
}));

const { submitTroubleReportAction } = await import(
  "@/app/(authenticated)/trouble-report/actions"
);

function validForm(): FormData {
  const f = new FormData();
  f.set("reporterName", "山田太郎");
  f.set("counterpartyName", "鈴木次郎");
  f.set("email", "yamada@example.com");
  f.set("category", "支払いトラブル");
  f.set("content", "報酬が支払われません");
  return f;
}

beforeEach(() => {
  authState.user = { id: "user-1" };
  userState.inserts = [];
  userState.insertError = null;
  adminState.count = 0;
  adminState.countError = null;
  adminState.updateError = null;
  adminState.updates = [];
  adminState.deletes = [];
  uploaderState.result = { success: true, paths: [] };
  uploaderState.removed = [];
});

describe("submitTroubleReportAction", () => {
  it("ログイン中は本人 user_id で保存する", async () => {
    const result = await submitTroubleReportAction(validForm());
    expect(result.success).toBe(true);
    expect(userState.inserts).toHaveLength(1);
    expect(userState.inserts[0].user_id).toBe("user-1");
    expect(userState.inserts[0].counterparty_name).toBe("鈴木次郎");
  });

  it("未ログインは拒否する（insert しない）", async () => {
    authState.user = null;
    const result = await submitTroubleReportAction(validForm());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("ログイン");
    expect(userState.inserts).toHaveLength(0);
  });

  it("同一ユーザー直近1時間が5件以上なら連投防止で拒否する", async () => {
    adminState.count = 5;
    const result = await submitTroubleReportAction(validForm());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("上限");
    expect(userState.inserts).toHaveLength(0);
  });

  it("必須項目が欠けると Zod 検証で拒否する", async () => {
    const f = validForm();
    f.set("content", "");
    const result = await submitTroubleReportAction(f);
    expect(result.success).toBe(false);
    expect(userState.inserts).toHaveLength(0);
  });

  it("トラブル種類は任意（未選択でも成功する）", async () => {
    const f = validForm();
    f.set("category", "");
    const result = await submitTroubleReportAction(f);
    expect(result.success).toBe(true);
    expect(userState.inserts[0].category).toBeNull();
  });

  it("添付アップロード失敗時はレコードを削除して中断する", async () => {
    uploaderState.result = {
      success: false,
      error: "ファイルのアップロードに失敗しました",
    };
    const result = await submitTroubleReportAction(validForm());
    expect(result.success).toBe(false);
    expect(userState.inserts).toHaveLength(1);
    expect(adminState.deletes).toHaveLength(1);
  });

  it("添付ありで成功時は attachments を admin クライアントで更新する", async () => {
    uploaderState.result = { success: true, paths: ["trouble/user-1/a.png"] };
    const result = await submitTroubleReportAction(validForm());
    expect(result.success).toBe(true);
    expect(adminState.updates).toHaveLength(1);
    expect(adminState.updates[0].attachments).toEqual([
      "trouble/user-1/a.png",
    ]);
  });
});
