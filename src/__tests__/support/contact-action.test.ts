import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * submitContactAction の統合テスト（support Task 6.1、書き込み+権限系のためフル）。
 * Server Action 自体はモックせず内部ロジックを実行。createClient/createAdminClient/
 * アップローダをモックし {data,error} 形状で正常・異常の両系を再現する。
 */

const authState = { user: null as null | { id: string } };

const adminState = {
  count: 0 as number | null,
  countError: null as null | { message: string },
  insertError: null as null | { message: string },
  updateError: null as null | { message: string },
  inserts: [] as { payload: Record<string, unknown> }[],
  updates: [] as { payload: Record<string, unknown>; val: unknown }[],
  deletes: [] as { val: unknown }[],
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
      insert: (payload: Record<string, unknown>) => {
        adminState.inserts.push({ payload });
        return {
          select: () => ({
            single: async () => ({
              data: adminState.insertError ? null : { id: "contact-1" },
              error: adminState.insertError,
            }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => ({
        eq: async (_col: string, val: unknown) => {
          adminState.updates.push({ payload, val });
          return { error: adminState.updateError };
        },
      }),
      delete: () => ({
        eq: async (_col: string, val: unknown) => {
          adminState.deletes.push({ val });
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

const { submitContactAction } = await import("@/app/(support)/contact/actions");

function validForm(): FormData {
  const f = new FormData();
  f.set("companyName", "山田工務店");
  f.set("name", "山田太郎");
  f.set("phone", "09012345678");
  f.set("email", "test@example.com");
  f.set("address", "東京都港区");
  f.set("inquiryType", "料金について");
  f.set("purpose", "仕事を依頼したい");
  f.set("industry", "大工");
  f.set("projectDescription", "");
  f.set("projectArea", "");
  f.set("videoConsultation", "");
  f.set("detail", "詳細な問い合わせ内容です");
  return f;
}

beforeEach(() => {
  authState.user = null;
  adminState.count = 0;
  adminState.countError = null;
  adminState.insertError = null;
  adminState.updateError = null;
  adminState.inserts = [];
  adminState.updates = [];
  adminState.deletes = [];
  uploaderState.result = { success: true, paths: [] };
  uploaderState.removed = [];
});

describe("submitContactAction", () => {
  it("匿名送信に成功し、user_id は null で保存する", async () => {
    const result = await submitContactAction(validForm());
    expect(result.success).toBe(true);
    expect(adminState.inserts).toHaveLength(1);
    expect(adminState.inserts[0].payload.user_id).toBeNull();
    expect(adminState.inserts[0].payload.company_name).toBe("山田工務店");
  });

  it("ログイン中はセッションの user_id を記録する（FormData からは取らない）", async () => {
    authState.user = { id: "user-9" };
    const f = validForm();
    f.set("user_id", "spoofed-id"); // なりすまし値は無視される
    const result = await submitContactAction(f);
    expect(result.success).toBe(true);
    expect(adminState.inserts[0].payload.user_id).toBe("user-9");
  });

  it("同一メール直近1時間が5件以上ならレート制限で拒否する（insert しない）", async () => {
    adminState.count = 5;
    const result = await submitContactAction(validForm());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("上限");
    expect(adminState.inserts).toHaveLength(0);
  });

  it("必須項目が欠けると Zod 検証で拒否する（insert しない）", async () => {
    const f = validForm();
    f.set("companyName", "");
    const result = await submitContactAction(f);
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("選択肢が許可リスト外なら拒否する", async () => {
    const f = validForm();
    f.set("inquiryType", "不正な値");
    const result = await submitContactAction(f);
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("添付アップロード失敗時はレコードを削除して中断する（部分保存なし）", async () => {
    uploaderState.result = { success: false, error: "ファイルのアップロードに失敗しました" };
    const result = await submitContactAction(validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(1);
    expect(adminState.deletes).toHaveLength(1);
    expect(adminState.deletes[0].val).toBe("contact-1");
  });

  it("添付パス更新失敗時はファイル削除＋レコード削除で中断する", async () => {
    uploaderState.result = { success: true, paths: ["contact/a.png"] };
    adminState.updateError = { message: "update failed" };
    const result = await submitContactAction(validForm());
    expect(result.success).toBe(false);
    expect(uploaderState.removed).toEqual([["contact/a.png"]]);
    expect(adminState.deletes).toHaveLength(1);
  });

  it("添付ありで成功時は attachments を更新する", async () => {
    uploaderState.result = { success: true, paths: ["contact/a.png"] };
    const result = await submitContactAction(validForm());
    expect(result.success).toBe(true);
    expect(adminState.updates).toHaveLength(1);
    expect(adminState.updates[0].payload.attachments).toEqual(["contact/a.png"]);
  });
});
