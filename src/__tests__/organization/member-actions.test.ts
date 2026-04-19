import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockInviteUser = vi.fn();
const mockAdminUpdateUserById = vi.fn();
const mockAdminDeleteUser = vi.fn();
const mockAuthUpdateUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockAuthUpdateUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    auth: {
      admin: {
        inviteUserByEmail: (...args: unknown[]) => mockInviteUser(...args),
        updateUserById: (...args: unknown[]) => mockAdminUpdateUserById(...args),
        deleteUser: (...args: unknown[]) => mockAdminDeleteUser(...args),
      },
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createMemberAction,
  updateMemberAction,
  deleteMemberAction,
  resendInviteAction,
} from "@/app/(authenticated)/mypage/members/actions";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_ID = "22222222-2222-2222-2222-222222222222";
const STAFF_ID = "33333333-3333-3333-3333-333333333333";
const ORG_ID = "55555555-5555-5555-5555-555555555555";
const NEW_USER_ID = "99999999-9999-9999-9999-999999999999";

function mockAuth(userId: string | null) {
  if (userId) {
    mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  }
}

interface Terminator {
  maybeSingle?: { data?: unknown; error?: unknown };
  single?: { data?: unknown; error?: unknown };
  thenable?: { data?: unknown; error?: unknown };
}

function createQueryMock(t: Terminator = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      t.maybeSingle ?? { data: null, error: null },
    ),
    single: vi.fn().mockResolvedValue(t.single ?? { data: null, error: null }),
  };
  if (t.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: t.thenable?.data ?? null, error: t.thenable?.error ?? null }),
    });
  }
  return chain;
}

function mockActorContext(userId: string, role: "owner" | "admin" | "staff") {
  // getActorContext の最初の maybeSingle: organization_members
  mockFrom.mockReturnValueOnce(
    createQueryMock({
      maybeSingle: {
        data: {
          organization_id: ORG_ID,
          org_role: role,
          organizations: { owner_id: OWNER_ID },
        },
        error: null,
      },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// createMemberAction
// ===========================================================================
describe("createMemberAction", () => {
  const validInput = {
    lastName: "山田",
    firstName: "太郎",
    email: "new@test.local",
    orgRole: "staff" as const,
    isProxyAccount: false,
  };

  it("未認証はエラー", async () => {
    mockAuth(null);
    const r = await createMemberAction(validInput);
    expect(r.success).toBe(false);
  });

  it("staff は作成不可", async () => {
    mockAuth(STAFF_ID);
    mockActorContext(STAFF_ID, "staff");
    const r = await createMemberAction(validInput);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("権限");
  });

  it("admin が admin を作成しようとすると拒否", async () => {
    mockAuth(ADMIN_ID);
    mockActorContext(ADMIN_ID, "admin");
    const r = await createMemberAction({ ...validInput, orgRole: "admin" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("管理者の作成");
  });

  it("メール重複は日本語エラーで早期リターン", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { id: "existing" },
          error: null,
        },
      }),
    );
    const r = await createMemberAction(validInput);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("既に登録");
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it("inviteUserByEmail にメタデータ（invited_role + 氏名）が渡される", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    ); // user 重複チェック
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { plan_type: "corporate" },
          error: null,
        },
      }),
    );
    mockInviteUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    // audit_logs insert
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await createMemberAction(validInput);
    expect(r.success).toBe(true);
    expect(mockInviteUser).toHaveBeenCalledWith(
      "new@test.local",
      expect.objectContaining({
        data: expect.objectContaining({
          invited_role: "staff",
          invited_last_name: "山田",
          invited_first_name: "太郎",
        }),
      }),
    );
  });

  it("RPC STAFF_LIMIT_EXCEEDED → 日本語エラー + auth cleanup", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { plan_type: "corporate" }, error: null },
      }),
    );
    mockInviteUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "STAFF_LIMIT_EXCEEDED: current=10, max=10" },
    });
    mockAdminDeleteUser.mockResolvedValue({ error: null });
    // audit_logs insert for cleanup_pending
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await createMemberAction(validInput);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("上限");
    expect(mockAdminDeleteUser).toHaveBeenCalledWith(NEW_USER_ID);
  });

  it("RPC PROXY_ACCOUNT_ALREADY_EXISTS → 日本語エラー", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { plan_type: "corporate" }, error: null },
      }),
    );
    mockInviteUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "PROXY_ACCOUNT_ALREADY_EXISTS: organization_id=..." },
    });
    mockAdminDeleteUser.mockResolvedValue({ error: null });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await createMemberAction({
      ...validInput,
      isProxyAccount: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("代理アカウントは既に");
  });
});

// ===========================================================================
// updateMemberAction
// ===========================================================================
describe("updateMemberAction", () => {
  it("未認証はエラー", async () => {
    mockAuth(null);
    const r = await updateMemberAction(STAFF_ID, { lastName: "X" });
    expect(r.success).toBe(false);
  });

  it("自己編集時は name のみ更新可能", async () => {
    mockAuth(STAFF_ID);
    mockActorContext(STAFF_ID, "staff");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            organization_id: ORG_ID,
            org_role: "staff",
            is_proxy_account: false,
            user_id: STAFF_ID,
          },
          error: null,
        },
      }),
    );
    const updateChain = createQueryMock({ thenable: { data: null, error: null } });
    mockAdminFrom.mockReturnValueOnce(updateChain);

    const r = await updateMemberAction(STAFF_ID, {
      lastName: "新姓",
      firstName: "新名",
    });
    expect(r.success).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_name: "新姓", first_name: "新名" }),
    );
  });

  it("代理アカウント ON 切替時、既存代理があればエラー（事前 SELECT）", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // target SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            organization_id: ORG_ID,
            org_role: "staff",
            is_proxy_account: false,
            user_id: STAFF_ID,
          },
          error: null,
        },
      }),
    );
    // 既存代理 SELECT → ヒット
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { user_id: "existing-proxy" }, error: null },
      }),
    );
    const r = await updateMemberAction(STAFF_ID, { isProxyAccount: true });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("代理アカウントは既に");
  });

  it("admin メール変更（他者）は admin.updateUserById + audit_log", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            organization_id: ORG_ID,
            org_role: "staff",
            is_proxy_account: false,
            user_id: STAFF_ID,
          },
          error: null,
        },
      }),
    );
    mockAdminUpdateUserById.mockResolvedValue({ error: null });
    // audit_logs
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await updateMemberAction(STAFF_ID, { email: "new@test.local" });
    expect(r.success).toBe(true);
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith(STAFF_ID, {
      email: "new@test.local",
      email_confirm: true,
    });
  });

  it("自己メール変更は auth.updateUser を使う", async () => {
    mockAuth(STAFF_ID);
    mockActorContext(STAFF_ID, "staff");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            organization_id: ORG_ID,
            org_role: "staff",
            is_proxy_account: false,
            user_id: STAFF_ID,
          },
          error: null,
        },
      }),
    );
    mockAuthUpdateUser.mockResolvedValue({ error: null });

    const r = await updateMemberAction(STAFF_ID, { email: "self-new@test.local" });
    expect(r.success).toBe(true);
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({
      email: "self-new@test.local",
    });
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// deleteMemberAction
// ===========================================================================
describe("deleteMemberAction", () => {
  it("未認証はエラー", async () => {
    mockAuth(null);
    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(false);
  });

  it("staff は削除不可", async () => {
    mockAuth(STAFF_ID);
    mockActorContext(STAFF_ID, "staff");
    const r = await deleteMemberAction(ADMIN_ID);
    expect(r.success).toBe(false);
  });

  it("自身の削除は不可", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    const r = await deleteMemberAction(OWNER_ID);
    expect(r.success).toBe(false);
  });

  it("正常系: RPC 呼び出し + audit_log", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { org_role: "staff" }, error: null },
      }),
    );
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);
    expect(mockAdminRpc).toHaveBeenCalledWith("delete_staff_member", {
      p_target_user_id: STAFF_ID,
      p_organization_id: ORG_ID,
      p_owner_user_id: OWNER_ID,
    });
  });
});

// ===========================================================================
// resendInviteAction
// ===========================================================================
describe("resendInviteAction", () => {
  it("password_set_at がセット済みなら拒否", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: STAFF_ID,
            email: "s@test.local",
            password_set_at: "2026-04-01",
          },
          error: null,
        },
      }),
    );
    const r = await resendInviteAction(STAFF_ID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("既に招待を完了");
  });

  it("password_set_at が NULL なら再送成功", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: STAFF_ID,
            email: "s@test.local",
            password_set_at: null,
          },
          error: null,
        },
      }),
    );
    mockInviteUser.mockResolvedValue({ data: { user: { id: STAFF_ID } }, error: null });

    const r = await resendInviteAction(STAFF_ID);
    expect(r.success).toBe(true);
    expect(mockInviteUser).toHaveBeenCalled();
  });
});
