import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockInviteUser = vi.fn();
const mockAdminUpdateUserById = vi.fn();
const mockAdminDeleteUser = vi.fn();
const mockAdminGetUserById = vi.fn();
const mockAuthUpdateUser = vi.fn();
const mockGetActiveOrgContext = vi.fn();

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
        getUserById: (...args: unknown[]) => mockAdminGetUserById(...args),
      },
    },
  }),
}));

// proxy-account-multi-org-support Phase 3: getActorContext は内部で
// getActiveOrganizationContext を呼ぶようになったため、ヘルパー本体をモック。
vi.mock("@/lib/organization/active-org-context", () => ({
  getActiveOrganizationContext: (...args: unknown[]) =>
    mockGetActiveOrgContext(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// vi.mock は hoist されるため、テスト内から参照したい mock 関数は
// vi.hoisted で巻き上げて factory に渡す必要がある。
const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async (_args: unknown) => ({ success: true as const })),
}));
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: sendEmailMock,
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
    is: vi.fn().mockReturnThis(),
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

function mockActorContext(
  _userId: string,
  role: "owner" | "admin" | "staff",
  isProxyAccount: boolean = false,
) {
  // proxy-account-multi-org-support Phase 3:
  // getActorContext は getActiveOrganizationContext を呼ぶ。
  // active が null か非 null かで挙動が決まる。
  mockGetActiveOrgContext.mockResolvedValueOnce({
    active: {
      organizationId: ORG_ID,
      orgRole: role,
      isProxyAccount,
      orgOwnerId: OWNER_ID,
      isCorporate: true,
    },
    all: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // 既定: organization_members なし（null active）。各テストで mockActorContext で上書き。
  mockGetActiveOrgContext.mockResolvedValue({ active: null, all: [] });
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

  it("既存ユーザー (代理在籍なし) は『既に登録』日本語エラーで早期リターン", async () => {
    // resolveExistingProxyReuse 経由:
    //   1. SELECT users → 既存ユーザー (deleted_at=null)
    //   2. SELECT organization_members → 空配列 (代理在籍なし)
    //   → reject_email_taken
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "existing",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
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
// R2: 既存ユーザー再利用パス (proxy-account-multi-org-support Phase 6 / Task 6.4)
// ===========================================================================
describe("R2: createMemberAction 既存ユーザー再利用パス", () => {
  const proxyInput = {
    lastName: "山田",
    firstName: "太郎",
    email: "proxy@test.local",
    orgRole: "staff" as const,
    isProxyAccount: true,
  };

  const EXISTING_PROXY_ID = "abcdef00-0000-0000-0000-000000000001";

  function mockHelperFindExistingProxy(name: { last_name: string; first_name: string }) {
    // resolveExistingProxyReuse の SELECT users → 既存代理ユーザー
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: EXISTING_PROXY_ID,
            last_name: name.last_name,
            first_name: name.first_name,
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    // resolveExistingProxyReuse の SELECT organization_members → 代理在籍 1 件以上
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [{ organization_id: "org-other" }],
          error: null,
        },
      }),
    );
  }

  it("N 組織への代理招待: 既存代理 + 同氏名 → inviteUserByEmail スキップ + RPC + 通知メール", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockHelperFindExistingProxy({ last_name: "山田", first_name: "太郎" });
    // SELECT subscriptions (maxStaff lookup)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { plan_type: "corporate" }, error: null },
      }),
    );
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    // audit_logs insert
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // sendProxyAssignedEmail 内 3 つの SELECT (users, client_profiles, users)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "山田", first_name: "太郎" },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト株式会社" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "佐藤", first_name: "一郎" }, error: null },
      }),
    );

    const r = await createMemberAction(proxyInput);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.userId).toBe(EXISTING_PROXY_ID);

    // 既存ユーザー再利用パスでは inviteUserByEmail を呼ばない
    expect(mockInviteUser).not.toHaveBeenCalled();
    // 既存 user_id で RPC が呼ばれる
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "insert_staff_member_with_limit",
      expect.objectContaining({
        p_user_id: EXISTING_PROXY_ID,
        p_is_proxy_account: true,
      }),
    );
    // 通知メールが送信される
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailCall = sendEmailMock.mock.calls[0]?.[0] as
      | { to: string; subject: string; html: string }
      | undefined;
    expect(emailCall?.to).toBe("proxy@test.local");
    expect(emailCall?.subject).toContain("代理アカウント");
    expect(emailCall?.subject).toContain("テスト株式会社");
  });

  it("既存代理 + 氏名不一致 → reject_name_mismatch エラー (応答に既存氏名を含めない)", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // 既存ユーザーは 佐藤花子 / 入力は 山田太郎 で不一致
    mockHelperFindExistingProxy({ last_name: "佐藤", first_name: "花子" });

    const r = await createMemberAction(proxyInput);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("違うお名前");
      // プライバシー: エラー応答に既存氏名 (佐藤 / 花子) を含めない
      expect(r.error).not.toContain("佐藤");
      expect(r.error).not.toContain("花子");
    }
    expect(mockInviteUser).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("通常スタッフ招待 (isProxyAccount=false) + 既存代理ユーザー → reject_email_taken", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockHelperFindExistingProxy({ last_name: "山田", first_name: "太郎" });

    const r = await createMemberAction({
      ...proxyInput,
      isProxyAccount: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("既に登録");
    expect(mockInviteUser).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("既存ユーザー (代理在籍なし、一般受注者など) → reject_email_taken", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // 既存ユーザーあり (deleted_at=null) だが代理在籍 0 件
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "regular-user",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await createMemberAction(proxyInput);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("既に登録");
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it("削除済みユーザー (deleted_at セット済み) → new_user 扱い → invite 通常パス", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // helper の SELECT users → deleted_at セット済み (退会後の再登録)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "deleted-user",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: "2026-01-01T00:00:00Z",
          },
          error: null,
        },
      }),
    );
    // helper は deleted_at セット時に SELECT organization_members を発行しない
    // (= 通常の new_user パスに合流。SELECT subscriptions が次に来る)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { plan_type: "corporate" }, error: null },
      }),
    );
    mockInviteUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await createMemberAction(proxyInput);
    expect(r.success).toBe(true);
    // 削除済みユーザー → 新規 auth.users 作成パス
    expect(mockInviteUser).toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "insert_staff_member_with_limit",
      expect.objectContaining({ p_user_id: NEW_USER_ID }),
    );
    // reuse パスではないため通知メールは送信されない
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("reuse パスで RPC が PROXY_ACCOUNT_ALREADY_EXISTS を返した場合: cleanup 不要 + 日本語エラー", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockHelperFindExistingProxy({ last_name: "山田", first_name: "太郎" });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { plan_type: "corporate" }, error: null },
      }),
    );
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "PROXY_ACCOUNT_ALREADY_EXISTS: organization_id=..." },
    });
    // 失敗 audit log
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await createMemberAction(proxyInput);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("代理アカウントは既に");
    // reuse パスでは auth.users を作っていないため deleteUser は呼ばない
    expect(mockAdminDeleteUser).not.toHaveBeenCalled();
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

  it("admin メール変更（他者）は admin.updateUserById + audit_log + 通知メール送信", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // 1. target SELECT
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
    // 2. oldUser SELECT (for email notification)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "old@test.local",
            last_name: "田中",
            first_name: "太郎",
          },
          error: null,
        },
      }),
    );
    mockAdminUpdateUserById.mockResolvedValue({ error: null });
    // 3. audit_logs insert
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // 4. organizations SELECT for owner_user
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { id: ORG_ID, owner_user: { id: OWNER_ID } },
          error: null,
        },
      }),
    );
    // 5. client_profiles SELECT for organization display_name
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト株式会社" }, error: null },
      }),
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

  // -------------------------------------------------------------------------
  // Task 7: applyDeletedSuffix 統合（delete_staff_member v3 戻り値分岐）
  // -------------------------------------------------------------------------
  it("Task 7: globally_deleted=true → applyDeletedSuffix が呼ばれる", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { org_role: "staff" }, error: null },
      }),
    );
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: true },
      error: null,
    });
    // applyDeletedSuffix 内部の getUserById → 印付け email 候補
    mockAdminGetUserById.mockResolvedValueOnce({
      data: { user: { id: STAFF_ID, email: "staff@test.local" } },
      error: null,
    });
    // updateUserById（印付け書き換え）成功
    mockAdminUpdateUserById.mockResolvedValueOnce({
      data: { user: { id: STAFF_ID } },
      error: null,
    });
    // audit_logs.insert（applyDeletedSuffix 内部）
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // audit_logs.insert（logAudit member_deleted）
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);

    expect(mockAdminGetUserById).toHaveBeenCalledWith(STAFF_ID);
    expect(mockAdminUpdateUserById).toHaveBeenCalledTimes(1);
    const [calledUserId, calledOpts] =
      mockAdminUpdateUserById.mock.calls[0] ?? [];
    expect(calledUserId).toBe(STAFF_ID);
    expect((calledOpts as { email_confirm?: boolean }).email_confirm).toBe(
      true,
    );
    expect((calledOpts as { email?: string }).email).toMatch(
      /^deleted-\d{8}-[a-z0-9]{4}-staff@test\.local$/,
    );
  });

  it("Task 7: globally_deleted=false → applyDeletedSuffix は呼ばれない（N 組織兼任継続）", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { org_role: "staff" }, error: null },
      }),
    );
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: false },
      error: null,
    });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);
    expect(mockAdminGetUserById).not.toHaveBeenCalled();
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled();
  });

  it("Task 7: applyDeletedSuffix が予期せず throw しても削除は成功扱い", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { org_role: "staff" }, error: null },
      }),
    );
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: true },
      error: null,
    });
    // getUserById で throw（SDK の想定外 throw を模擬）
    mockAdminGetUserById.mockRejectedValueOnce(new Error("network down"));
    // applyDeletedSuffix は throw せず内部で failed 返却 + audit 書込み試行
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);
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

// ===========================================================================
// R6: 代理 + admin 組み合わせ禁止 (proxy-account-multi-org-support Phase 1)
// ===========================================================================
describe("R6: 代理 + admin の組み合わせを Server Action が拒否する", () => {
  const validBase = {
    lastName: "山田",
    firstName: "太郎",
    email: "r6@test.local",
    orgRole: "admin" as const,
    isProxyAccount: true,
  };

  it("createMemberAction が proxyAdminCombination を拒否し、招待 RPC に到達しない", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");

    const r = await createMemberAction(validBase);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("代理アカウントは担当者権限");
    }
    expect(mockInviteUser).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("updateMemberAction が proxyAdminCombination を拒否し、UPDATE に到達しない", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // target SELECT は呼ばれないはず → mockAdminFrom は使われない

    const r = await updateMemberAction(STAFF_ID, {
      orgRole: "admin",
      isProxyAccount: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("代理アカウントは担当者権限");
    }
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });
});
