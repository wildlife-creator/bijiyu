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

vi.mock("next/headers", () => ({
  headers: async () =>
    new Map([
      ["host", "127.0.0.1:3000"],
      ["x-forwarded-proto", "http"],
    ]),
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

  it("inviteUserByEmail に §5.1 招待テンプレ用 metadata が全フィールド渡される（Staff 招待）", async () => {
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
    // §5.1: Owner の client_profiles.display_name 取得 (invited_org_name)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト株式会社" }, error: null },
      }),
    );
    // §5.1: actor の姓名取得 (invited_by_name)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "発注", first_name: "者一郎" },
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
    // §5.2.A broadcast: organization_members を空にして 0 受信者 → early exit
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
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
          invited_org_name: "テスト株式会社",
          invited_by_name: "発注者一郎",
          invited_at: expect.stringMatching(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/),
          is_proxy_account: false,
        }),
      }),
    );
  });

  it("代理招待時は is_proxy_account: true で metadata が渡される（§5.1-Proxy 分岐キー）", async () => {
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
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "○○建設" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山田", first_name: "一郎" }, error: null },
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
    // §5.6.C/D bundle (sendToTarget=false): 4 並列クエリ。
    // target users / owner client_profiles / actor users / organization_members(空)
    // 空で early exit させて sendEmail 0 通にする。
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山田", first_name: "太郎" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "○○建設" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山田", first_name: "一郎" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await createMemberAction({ ...validInput, isProxyAccount: true });
    expect(r.success).toBe(true);
    expect(mockInviteUser).toHaveBeenCalledWith(
      "new@test.local",
      expect.objectContaining({
        data: expect.objectContaining({
          is_proxy_account: true,
          invited_org_name: "○○建設",
          invited_by_name: "山田一郎",
        }),
      }),
    );
  });

  it("Owner の client_profiles が無ければ「ビジ友組織」、actor 氏名が無ければ「管理者」にフォールバック", async () => {
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
    // client_profiles 取得失敗
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // actor users 取得失敗
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockInviteUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.2.A broadcast: 0 受信者で early exit
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await createMemberAction(validInput);
    expect(r.success).toBe(true);
    expect(mockInviteUser).toHaveBeenCalledWith(
      "new@test.local",
      expect.objectContaining({
        data: expect.objectContaining({
          invited_org_name: "ビジ友組織",
          invited_by_name: "管理者",
        }),
      }),
    );
  });

  it("§5.2.A: 通常 staff 招待成功時に組織管理層 broadcast が飛ぶ", async () => {
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
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト株式会社" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "発注", first_name: "者一郎" },
          error: null,
        },
      }),
    );
    mockInviteUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    ); // audit_logs
    // §5.2.A: organization_members → Owner 1 名
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ user_id: OWNER_ID }], error: null },
      }),
    );
    // §5.2.A: users (recipients filter) → Owner 1 名アクティブ
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "発注",
              first_name: "者一郎",
            },
          ],
          error: null,
        },
      }),
    );
    // §5.2.A: users (actor lookup) → Owner 本人
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "発注", first_name: "者一郎" },
          error: null,
        },
      }),
    );

    const r = await createMemberAction(validInput);
    expect(r.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]?.[0] as
      | { to: string; subject: string; html: string }
      | undefined;
    expect(call?.to).toBe("owner@test.local");
    expect(call?.subject).toBe(
      "【ビジ友】山田太郎さんをメンバーとして招待しました",
    );
    expect(call?.html).toContain("発注者一郎 様");
    expect(call?.html).toContain("【担当者氏名】 山田太郎");
    expect(call?.html).toContain("【メールアドレス】 new@test.local");
    expect(call?.html).toContain("【権限】 担当者");
    expect(call?.html).toContain("【代理アカウント】 いいえ");
    expect(call?.html).toContain("【招待操作者】 発注者一郎");
  });

  it("§5.2.A: 代理 staff 招待 (isProxyAccount=true) では broadcast は飛ばない", async () => {
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
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "○○建設" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山田", first_name: "一郎" }, error: null },
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

    const r = await createMemberAction({ ...validInput, isProxyAccount: true });
    expect(r.success).toBe(true);
    // 代理招待では §5.2.A は発火しない (§5.6.D に委譲予定)
    expect(sendEmailMock).not.toHaveBeenCalled();
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
    // §5.1: client_profiles + actor users
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山", first_name: "田" }, error: null },
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
    // §5.1: client_profiles + actor users
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山", first_name: "田" }, error: null },
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
    // §5.6.C + §5.6.D sendProxyAssignedBundle: 4 並列クエリ
    //   1. target users SELECT (recipientName 解決)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "山田", first_name: "太郎" },
          error: null,
        },
      }),
    );
    //   2. owner client_profiles SELECT (organizationName 解決)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト株式会社" }, error: null },
      }),
    );
    //   3. actor users SELECT (actorName 解決)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "佐藤", first_name: "一郎" }, error: null },
      }),
    );
    //   4a. §5.6.D 受信者解決: organization_members → Owner 自身
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ user_id: OWNER_ID }], error: null },
      }),
    );
    //   4b. §5.6.D 受信者解決: users
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "佐藤",
              first_name: "一郎",
            },
          ],
          error: null,
        },
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
    // §5.6.C 本人宛 1 通 + §5.6.D Owner 宛 1 通 = 計 2 通
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("proxy@test.local");
    expect(sentTos).toContain("owner@test.local");

    // §5.6.C 本人宛検証
    const selfMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "proxy@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(selfMail?.subject).toContain("代理アカウント");
    expect(selfMail?.subject).toContain("テスト株式会社");

    // §5.6.D 法人側検証
    const controlMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "owner@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(controlMail?.subject).toBe(
      "【ビジ友】山田太郎さんを代理アカウントとして設定しました",
    );
    expect(controlMail?.html).toContain("(ビジ友運営スタッフ)");
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
    // §5.1: client_profiles + actor users
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山", first_name: "田" }, error: null },
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
    // §5.6.C/D bundle (新規招待 + 代理、sendToTarget=false): 4 並列クエリ。
    // organization_members 空で 0 受信者 → sendEmail 0 通。
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山田", first_name: "太郎" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "山", first_name: "田" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await createMemberAction(proxyInput);
    expect(r.success).toBe(true);
    // 削除済みユーザー → 新規 auth.users 作成パス
    expect(mockInviteUser).toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "insert_staff_member_with_limit",
      expect.objectContaining({ p_user_id: NEW_USER_ID }),
    );
    // 新規招待 + 代理: §5.1-Proxy(Supabase Auth)で本人完結、§5.6.D は受信者 0 名で send なし
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
    // 6. §5.4.B broadcast: organization_members 空で早期終了
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await updateMemberAction(STAFF_ID, { email: "new@test.local" });
    expect(r.success).toBe(true);
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith(STAFF_ID, {
      email: "new@test.local",
      email_confirm: true,
    });
  });

  it("§5.4.B: admin メール変更時、組織管理層 (Owner + admin) に control mail が飛び、変更対象本人は除外", async () => {
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
    // 2. oldUser SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { email: "old@test.local", last_name: "田", first_name: "太" },
          error: null,
        },
      }),
    );
    mockAdminUpdateUserById.mockResolvedValue({ error: null });
    // 3. audit_logs
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // 4. organizations
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { id: ORG_ID, owner_user: { id: OWNER_ID } },
          error: null,
        },
      }),
    );
    // 5. client_profiles
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト" }, error: null },
      }),
    );
    // 6. §5.4.B helper step 1: organization_members → Owner 自身が候補
    //    (変更対象 = STAFF_ID は exclude されるので含まれない)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [{ user_id: OWNER_ID }],
          error: null,
        },
      }),
    );
    // 7. §5.4.B helper step 2: users (recipients) → Owner アクティブ
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "発注",
              first_name: "者一郎",
            },
          ],
          error: null,
        },
      }),
    );
    // 8. §5.4.B actor lookup
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "発注", first_name: "者一郎" },
          error: null,
        },
      }),
    );

    const r = await updateMemberAction(STAFF_ID, { email: "new@test.local" });
    expect(r.success).toBe(true);

    // §5.4.A: 旧 + 新 の 2 通 + §5.4.B: Owner 宛 1 通 = 計 3 通
    expect(sendEmailMock).toHaveBeenCalledTimes(3);

    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("old@test.local");
    expect(sentTos).toContain("new@test.local");
    expect(sentTos).toContain("owner@test.local");

    // §5.4.B 内容検証
    const controlCall = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "owner@test.local",
    );
    const controlMail = controlCall?.[0] as
      | { subject: string; html: string }
      | undefined;
    expect(controlMail?.subject).toBe(
      "【ビジ友】田太さんのメールアドレスを変更しました",
    );
    expect(controlMail?.html).toContain("発注者一郎 様");
    expect(controlMail?.html).toContain("【対象担当者】 田太");
    expect(controlMail?.html).toContain("【旧メールアドレス】 old@test.local");
    expect(controlMail?.html).toContain("【新メールアドレス】 new@test.local");
    expect(controlMail?.html).toContain("【操作者】 発注者一郎");
  });

  // -------------------------------------------------------------------------
  // §5.4 BUG 回帰防止 (commit b888b2e): 旧 = 新 email の no-op 保存で
  // §5.4.A 本人宛 / §5.4.B 組織管理層宛の虚偽通知が飛ばないことを保証する。
  //
  // フォームの email は initialValues から常に populate されるため、氏名 / 権限だけを
  // 変更する保存リクエストでも email フィールドが含まれる。
  // `if (oldEmail !== parsed.data.email)` ガードが外れると「【旧 X@】【新 X@】」の
  // 同一値メールが本人 + Owner / admin 全員に飛ぶ。
  // -------------------------------------------------------------------------
  it("§5.4 BUG 回帰防止: 旧 == 新 email の no-op 保存では updateUserById も通知メールも呼ばれない", async () => {
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
    // 2. oldUser SELECT: フォーム表示で populate されるのと同じ email
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "same@test.local",
            last_name: "田",
            first_name: "太",
          },
          error: null,
        },
      }),
    );
    // ガードで早期 return されるため audit_logs / organizations / client_profiles
    // / §5.4.B broadcast 系のチェインは一切呼ばれない (= mock は登録しない)

    const r = await updateMemberAction(STAFF_ID, { email: "same@test.local" });
    expect(r.success).toBe(true);

    // §5.4 ガード: admin.updateUserById は実行されない
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled();
    // §5.4.A 本人宛 / §5.4.B 組織管理層宛のいずれも発火しない
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("§5.4 BUG 回帰防止 (positive control): 旧 != 新 email では updateUserById が呼ばれる", async () => {
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
    // 2. oldUser SELECT: 旧 email
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "old@test.local",
            last_name: "田",
            first_name: "太",
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
    // 4. organizations SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { id: ORG_ID, owner_user: { id: OWNER_ID } },
          error: null,
        },
      }),
    );
    // 5. client_profiles SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト" }, error: null },
      }),
    );
    // 6. §5.4.B broadcast: organization_members を空で early exit
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await updateMemberAction(STAFF_ID, { email: "new@test.local" });
    expect(r.success).toBe(true);

    // ガードは「旧 != 新」を抜けるので updateUserById は呼ばれる
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith(STAFF_ID, {
      email: "new@test.local",
      email_confirm: true,
    });
    // §5.4.A 本人宛 (旧 + 新 = 2 通)。§5.4.B は organization_members 0 件で送らない。
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const tos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(tos).toContain("old@test.local");
    expect(tos).toContain("new@test.local");
  });

  it("§5.6.A/B: org_role 変更成功時に本人 + 組織管理層 (本人除外) にメールが飛ぶ", async () => {
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
    // organization_members UPDATE (memberUpdates)
    const updateChain = createQueryMock({ thenable: { data: null, error: null } });
    mockAdminFrom.mockReturnValueOnce(updateChain);
    // §5.6 sendMemberRoleChanged: 3 並列クエリ (target users, actor users, recipients)
    // target users SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { email: "target@test.local", last_name: "田", first_name: "中" },
          error: null,
        },
      }),
    );
    // actor users SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { last_name: "発注", first_name: "者一郎" },
          error: null,
        },
      }),
    );
    // getOrganizationManagementRecipients: organization_members → Owner 自身
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ user_id: OWNER_ID }], error: null },
      }),
    );
    // getOrganizationManagementRecipients: users → Owner アクティブ
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "発注",
              first_name: "者一郎",
            },
          ],
          error: null,
        },
      }),
    );

    const r = await updateMemberAction(STAFF_ID, { orgRole: "admin" });
    expect(r.success).toBe(true);

    // §5.6.A 本人宛 1 通 + §5.6.B Owner 宛 1 通 = 計 2 通
    expect(sendEmailMock).toHaveBeenCalledTimes(2);

    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("target@test.local");
    expect(sentTos).toContain("owner@test.local");

    // §5.6.A 本人宛検証
    const selfMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "target@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(selfMail?.subject).toBe("【ビジ友】あなたの権限が変更されました");
    expect(selfMail?.html).toContain("田中 様");
    expect(selfMail?.html).toContain("【変更前の権限】 担当者");
    expect(selfMail?.html).toContain("【変更後の権限】 管理者");

    // §5.6.B 組織管理層宛検証
    const controlMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "owner@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(controlMail?.subject).toBe(
      "【ビジ友】田中さんの権限を変更しました",
    );
    expect(controlMail?.html).toContain("発注者一郎 様");
    expect(controlMail?.html).toContain("【対象担当者】 田中");
  });

  it("§5.6.C/D: is_proxy_account 後付け切替 (false→true) で本人(§5.6.C) + 組織管理層(§5.6.D) bundle 送信", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // target SELECT (is_proxy_account=false)
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
    // 代理一意性事前チェック → 既存なし
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    // memberUpdates UPDATE
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.6.C/D bundle 前: target email 取得
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { email: "target@test.local" }, error: null },
      }),
    );
    // §5.6.C/D bundle (sendToTarget=true): 4 並列クエリ
    // 1. target users SELECT (recipientName)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "田", first_name: "中" }, error: null },
      }),
    );
    // 2. owner client_profiles
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "テスト株式会社" }, error: null },
      }),
    );
    // 3. actor users
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "発注", first_name: "者一郎" }, error: null },
      }),
    );
    // 4a. recipients: organization_members → Owner 自身
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ user_id: OWNER_ID }], error: null },
      }),
    );
    // 4b. recipients: users
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "発注",
              first_name: "者一郎",
            },
          ],
          error: null,
        },
      }),
    );

    const r = await updateMemberAction(STAFF_ID, { isProxyAccount: true });
    expect(r.success).toBe(true);

    // §5.6.C 本人宛 1 + §5.6.D Owner 宛 1 = 計 2 通
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("target@test.local");
    expect(sentTos).toContain("owner@test.local");

    // §5.6.C 本人宛
    const selfMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "target@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(selfMail?.subject).toContain("代理アカウント");
    expect(selfMail?.subject).toContain("テスト株式会社");

    // §5.6.D 法人側
    const controlMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "owner@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(controlMail?.subject).toBe(
      "【ビジ友】田中さんを代理アカウントとして設定しました",
    );
    expect(controlMail?.html).toContain("(ビジ友運営スタッフ)");
  });

  it("§5.6.C/D: is_proxy_account が true→false の OFF 切替では送信なし (spec §5.6 解除は通知しない)", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // target SELECT (is_proxy_account=true)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            organization_id: ORG_ID,
            org_role: "staff",
            is_proxy_account: true,
            user_id: STAFF_ID,
          },
          error: null,
        },
      }),
    );
    // memberUpdates UPDATE
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await updateMemberAction(STAFF_ID, { isProxyAccount: false });
    expect(r.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("§5.6.A/B: orgRole が target と同値 (変更なし) なら role-change メールは飛ばない", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            organization_id: ORG_ID,
            org_role: "admin",
            is_proxy_account: false,
            user_id: STAFF_ID,
          },
          error: null,
        },
      }),
    );
    // memberUpdates UPDATE (org_role を同値 "admin" にセットしても UPDATE は呼ばれる、§5.6 だけ skip)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );

    const r = await updateMemberAction(STAFF_ID, { orgRole: "admin" });
    expect(r.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
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
    // §5.5.D: emailRedirectTo を渡してランディングへ誘導
    expect(mockAuthUpdateUser).toHaveBeenCalledWith(
      { email: "self-new@test.local" },
      {
        emailRedirectTo:
          "http://127.0.0.1:3000/email-change-confirmed",
      },
    );
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
    // target SELECT (organization_members)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: false },
          error: null,
        },
      }),
    );
    // §5.7.5 用 targetUserRow SELECT (users)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.7.5 sendMemberRemoved: 3 並列クエリ (client_profiles, actor users, organization_members 空)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
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
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: false },
          error: null,
        },
      }),
    );
    // §5.7.5 用 targetUserRow SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
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
    // §5.7.5 sendMemberRemoved: 3 並列クエリ
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
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
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: false },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: false },
      error: null,
    });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.7.5 sendMemberRemoved short-circuit
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);
    expect(mockAdminGetUserById).not.toHaveBeenCalled();
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled();
  });

  it("§5.7 (代理削除): is_proxy_account=true 削除時に §5.7.A 本人(残存あり) + §5.7.B 組織管理層に送信", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    // target SELECT: is_proxy_account=true
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: true },
          error: null,
        },
      }),
    );
    // targetUserRow SELECT
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "proxy@bijiyu.local",
            last_name: "ビジ友",
            first_name: "代理",
          },
          error: null,
        },
      }),
    );
    // RPC: globally_deleted=false → 残存あり
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: false },
      error: null,
    });
    // logAudit member_deleted
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.7 sendMemberRemoved 3 並列クエリ
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "○○建設" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "発注", first_name: "者一郎" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ user_id: OWNER_ID }], error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "発注",
              first_name: "者一郎",
            },
          ],
          error: null,
        },
      }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);

    // §5.7.A 本人 + §5.7.B Owner = 計 2 通
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("proxy@bijiyu.local");
    expect(sentTos).toContain("owner@test.local");

    // §5.7.A 本人宛: 残存あり末尾分岐 + 「【ビジ友 運営】」プレフィックス
    const selfMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "proxy@bijiyu.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(selfMail?.subject).toBe(
      "【ビジ友 運営】「○○建設」の代理アカウント設定が解除されました",
    );
    expect(selfMail?.html).toContain("他の法人組織での代理業務は引き続き継続します");
    expect(selfMail?.html).not.toContain("すべての法人組織での代理アカウント設定が解除");

    // §5.7.B 法人側: 「(ビジ友運営スタッフ)」サフィックス + 「一部」を削除した断言
    const controlMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "owner@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(controlMail?.subject).toBe(
      "【ビジ友】ビジ友代理さんの代理アカウント設定を解除しました",
    );
    expect(controlMail?.html).toContain("(ビジ友運営スタッフ)");
    expect(controlMail?.html).toContain("代行することはなくなります");
  });

  it("§5.7 (代理削除、globally_deleted=true): §5.7.A 残存なし末尾分岐に切り替わる", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: true },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "proxy@bijiyu.local",
            last_name: "ビジ友",
            first_name: "代理",
          },
          error: null,
        },
      }),
    );
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: true },
      error: null,
    });
    mockAdminGetUserById.mockResolvedValueOnce({
      data: { user: { id: STAFF_ID, email: "proxy@bijiyu.local" } },
      error: null,
    });
    mockAdminUpdateUserById.mockResolvedValueOnce({
      data: { user: { id: STAFF_ID } },
      error: null,
    });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.7 sendMemberRemoved short-circuit (0 receivers, but target self mail still sent)
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "○○建設" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "発", first_name: "注" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);

    // §5.7.A 本人 1 通のみ (0 受信者なので §5.7.B なし)
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const selfMail = sendEmailMock.mock.calls[0]?.[0] as
      | { html: string }
      | undefined;
    // 残存なし末尾分岐
    expect(selfMail?.html).toContain("すべての法人組織での代理アカウント設定が解除");
    expect(selfMail?.html).not.toContain("他の法人組織での代理業務は引き続き");
  });

  it("§5.7.5 (通常 staff 削除): is_proxy_account=false 削除時に §5.7.5.A + §5.7.5.B 送信", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: false },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "staff@test.local",
            last_name: "田",
            first_name: "中",
          },
          error: null,
        },
      }),
    );
    mockAdminRpc.mockResolvedValue({
      data: { user_id: STAFF_ID, globally_deleted: true },
      error: null,
    });
    mockAdminGetUserById.mockResolvedValueOnce({
      data: { user: { id: STAFF_ID, email: "staff@test.local" } },
      error: null,
    });
    mockAdminUpdateUserById.mockResolvedValueOnce({
      data: { user: { id: STAFF_ID } },
      error: null,
    });
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: null, error: null } }),
    );
    // §5.7.5 sendMemberRemoved
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { display_name: "○○建設" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { last_name: "発", first_name: "注" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ user_id: OWNER_ID }], error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            {
              id: OWNER_ID,
              email: "owner@test.local",
              last_name: "発",
              first_name: "注",
            },
          ],
          error: null,
        },
      }),
    );

    const r = await deleteMemberAction(STAFF_ID);
    expect(r.success).toBe(true);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("staff@test.local");
    expect(sentTos).toContain("owner@test.local");

    // §5.7.5.A 本人宛
    const selfMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "staff@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(selfMail?.subject).toBe(
      "【ビジ友】「○○建設」の組織から削除されました",
    );
    expect(selfMail?.html).toContain("これに伴い、ビジ友のご利用は終了いたしました");

    // §5.7.5.B 法人側: 「(ビジ友運営スタッフ)」サフィックス無し
    const controlMail = sendEmailMock.mock.calls.find(
      (c) => (c[0] as { to: string }).to === "owner@test.local",
    )?.[0] as { subject: string; html: string } | undefined;
    expect(controlMail?.subject).toBe("【ビジ友】田中さんを担当者から削除しました");
    expect(controlMail?.html).not.toContain("(ビジ友運営スタッフ)");
  });

  it("Task 7: applyDeletedSuffix が予期せず throw しても削除は成功扱い", async () => {
    mockAuth(OWNER_ID);
    mockActorContext(OWNER_ID, "owner");
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { org_role: "staff", is_proxy_account: false },
          error: null,
        },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
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
    // §5.7.5 sendMemberRemoved short-circuit
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
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
