import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * submitJobInquiryAction の統合テスト（job-inquiry Task 7.1）。
 * Supabase クライアント・sendEmail・next/headers をモックし、Server Action の
 * 内部ロジック（access-guard / Zod / 連投制限 / INSERT / fire-and-forget メール）を
 * 実際に動かす。access-guard・resolve-context・schema・メールテンプレは実物を使う。
 */

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

const authState = { user: null as null | { id: string } };
const serverState = { viewerRole: "contractor" as string | null };

interface TargetUser {
  id: string;
  role: string;
  deleted_at: string | null;
  email: string | null;
  last_name: string | null;
  first_name: string | null;
}

const adminState = {
  viewerMembership: null as null | { organization_id: string },
  ownedOrgByOwner: {} as Record<string, string>,
  targetUser: null as TargetUser | null,
  targetProfile: null as null | { display_name: string | null },
  count: 0 as number | null,
  countError: null as null | { message: string },
  insertError: null as null | { message: string },
  inserts: [] as Record<string, unknown>[],
};

function serverFrom(table: string) {
  if (table === "users") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: serverState.viewerRole },
            error: null,
          }),
        }),
      }),
    };
  }
  throw new Error(`unexpected server table: ${table}`);
}

function adminFrom(table: string) {
  if (table === "organization_members") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: adminState.viewerMembership,
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === "organizations") {
    return {
      select: () => ({
        eq: (_col: string, val: string) => ({
          is: () => ({
            maybeSingle: async () => ({
              data: adminState.ownedOrgByOwner[val]
                ? { id: adminState.ownedOrgByOwner[val] }
                : null,
              error: null,
            }),
          }),
        }),
      }),
    };
  }
  if (table === "users") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: adminState.targetUser, error: null }),
        }),
      }),
    };
  }
  if (table === "client_profiles") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: adminState.targetProfile,
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === "job_inquiries") {
    return {
      select: () => ({
        eq: () => ({
          gte: async () => ({
            count: adminState.count,
            error: adminState.countError,
          }),
        }),
      }),
      insert: async (payload: Record<string, unknown>) => {
        adminState.inserts.push(payload);
        return { error: adminState.insertError };
      },
    };
  }
  throw new Error(`unexpected admin table: ${table}`);
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: (table: string) => serverFrom(table),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => adminFrom(table) }),
}));

// proxy-account-multi-org-support: resolveViewerOrganizationId が
// `supabase` 引数を渡されると getActiveOrganizationContext を経由する。
// ヘルパー本体をモックして adminState.viewerMembership と同期させる。
vi.mock("@/lib/organization/active-org-context", () => ({
  getActiveOrganizationContext: async () => ({
    active: adminState.viewerMembership
      ? {
          organizationId: adminState.viewerMembership.organization_id,
          orgRole: "owner" as const,
          isProxyAccount: false,
          orgOwnerId: authState.user?.id ?? "",
          isCorporate: true,
        }
      : null,
    all: [],
  }),
}));

vi.mock("@/lib/email/send-email", () => ({ sendEmail: sendEmailMock }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "host" ? "127.0.0.1:3000" : null),
  }),
}));

const { submitJobInquiryAction } = await import(
  "@/app/(authenticated)/clients/[id]/inquiry/actions"
);

function validForm(): FormData {
  const f = new FormData();
  f.set("name", "山田太郎");
  f.set("email", "yamada@example.com");
  f.append("topics", "求人について話を聞きたい");
  f.set("content", "ぜひお願いします");
  return f;
}

beforeEach(() => {
  authState.user = { id: "viewer-1" };
  serverState.viewerRole = "contractor";
  adminState.viewerMembership = null;
  adminState.ownedOrgByOwner = {};
  adminState.targetUser = {
    id: "target-1",
    role: "client",
    deleted_at: null,
    email: "client@example.com",
    last_name: "発注",
    first_name: "太郎",
  };
  adminState.targetProfile = { display_name: "テスト工務店" };
  adminState.count = 0;
  adminState.countError = null;
  adminState.insertError = null;
  adminState.inserts = [];
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true });
});

describe("submitJobInquiryAction", () => {
  it("正常系: INSERT し、宛先へメールを fire-and-forget で送る", async () => {
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(true);
    expect(adminState.inserts).toHaveLength(1);
    expect(adminState.inserts[0].sender_id).toBe("viewer-1");
    expect(adminState.inserts[0].target_client_id).toBe("target-1");
    expect(adminState.inserts[0].topics).toEqual(["求人について話を聞きたい"]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("client@example.com");
  });

  it("法人発注者宛は target_organization_id を denormalize 保存する", async () => {
    adminState.ownedOrgByOwner = { "target-1": "org-1" };
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(true);
    expect(adminState.inserts[0].target_organization_id).toBe("org-1");
  });

  it("未ログインは拒否する（INSERT しない）", async () => {
    authState.user = null;
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("氏名未入力は Zod 検証で拒否する", async () => {
    const f = validForm();
    f.set("name", "");
    const result = await submitJobInquiryAction("target-1", f);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("氏名");
    expect(adminState.inserts).toHaveLength(0);
  });

  it("メール形式不正は拒否する", async () => {
    const f = validForm();
    f.set("email", "bad");
    const result = await submitJobInquiryAction("target-1", f);
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("お問い合わせ項目未選択は拒否する", async () => {
    const f = new FormData();
    f.set("name", "山田太郎");
    f.set("email", "yamada@example.com");
    f.set("content", "");
    const result = await submitJobInquiryAction("target-1", f);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("お問い合わせ項目");
    expect(adminState.inserts).toHaveLength(0);
  });

  it("自分宛は拒否する（self）", async () => {
    authState.user = { id: "self-1" };
    adminState.targetUser = {
      id: "self-1",
      role: "client",
      deleted_at: null,
      email: "self@example.com",
      last_name: "自分",
      first_name: "太郎",
    };
    const result = await submitJobInquiryAction("self-1", validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("自社（同一組織）宛は拒否する（same_org）", async () => {
    adminState.viewerMembership = { organization_id: "org-1" };
    adminState.ownedOrgByOwner = { "target-1": "org-1" };
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("退会済み宛は拒否する（deleted）", async () => {
    adminState.targetUser = {
      ...adminState.targetUser!,
      deleted_at: "2026-01-01T00:00:00Z",
    };
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("admin ロールは拒否する", async () => {
    serverState.viewerRole = "admin";
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("対象が存在しない場合は拒否する", async () => {
    adminState.targetUser = null;
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    expect(adminState.inserts).toHaveLength(0);
  });

  it("直近1時間5件以上は連投制限で拒否する", async () => {
    adminState.count = 5;
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("上限");
    expect(adminState.inserts).toHaveLength(0);
  });

  it("INSERT 失敗時は汎用エラーを返す", async () => {
    adminState.insertError = { message: "db error" };
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("エラー");
  });

  it("メール送信失敗時も本体は成功扱い（ロールバックしない）", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const result = await submitJobInquiryAction("target-1", validForm());
    expect(result.success).toBe(true);
    expect(adminState.inserts).toHaveLength(1);
  });
});
