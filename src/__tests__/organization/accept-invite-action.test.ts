import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockAuthUpdateUser = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockAuthUpdateUser(...args),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

const { sendEmailMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendEmailMock: vi.fn(async (_args: unknown) => ({ success: true as const })),
}));
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: sendEmailMock,
}));

import { acceptInviteAction } from "@/app/(auth)/accept-invite/confirm/actions";

beforeEach(() => {
  vi.clearAllMocks();
  sendEmailMock.mockReset().mockResolvedValue({ success: true });
});

interface Terminator {
  maybeSingle?: { data?: unknown; error?: unknown };
  thenable?: { data?: unknown; error?: unknown };
}

function createQueryMock(t: Terminator = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      t.maybeSingle ?? { data: null, error: null },
    ),
  };
  if (t.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: t.thenable?.data ?? null, error: t.thenable?.error ?? null }),
    });
  }
  return chain;
}

/** SELECT password_set_at（既セット判定）のチェイン */
function mockPriorPasswordSetAt(value: string | null = null) {
  mockAdminFrom.mockReturnValueOnce(
    createQueryMock({
      maybeSingle: { data: { password_set_at: value }, error: null },
    }),
  );
}

/** UPDATE password_set_at の thenable チェイン */
function mockUpdatePasswordSetAt() {
  mockAdminFrom.mockReturnValueOnce(
    createQueryMock({ thenable: { data: null, error: null } }),
  );
}

describe("acceptInviteAction", () => {
  it("弱いパスワード（8 文字未満）はバリデーションエラー", async () => {
    const r = await acceptInviteAction({
      password: "abc12",
      confirmPassword: "abc12",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("入力内容を確認してください");
  });

  it("パスワード不一致はバリデーションエラー", async () => {
    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd5678",
    });
    expect(r.success).toBe(false);
  });

  it("未認証（セッション無し）は期限切れエラー", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("有効期限が切れています");
  });

  it("updateUser で expired エラーは期限切れメッセージ", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({
      error: { message: "Token has expired" },
    });
    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("有効期限が切れています");
  });

  it("正常系（スタッフ招待）: password 更新 + password_set_at UPDATE + /mypage redirect + §5.3.B は飛ばない", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { invited_role: "staff" } } },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    mockPriorPasswordSetAt(null);
    mockUpdatePasswordSetAt();

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/mypage");
    // Staff 招待では §5.3.B 完了通知は飛ばない
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("管理者招待（invited_company_name あり）: /billing 直行 + §5.3.B 完了通知が admin 本人宛に飛ぶ", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u2",
          email: "client-target@test.local",
          user_metadata: {
            invited_company_name: "テスト建設株式会社",
            invited_last_name: "山田",
            invited_first_name: "一郎",
          },
        },
      },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    mockPriorPasswordSetAt(null);
    mockUpdatePasswordSetAt();
    // §5.3.B audit_logs 逆引き → actor_id
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { actor_id: "admin-1" }, error: null },
      }),
    );
    // §5.3.B admin の users 行
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            email: "admin@bijiyu.local",
            last_name: "ビジ友",
            first_name: "管理者",
          },
          error: null,
        },
      }),
    );

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/billing");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]?.[0] as
      | { to: string; subject: string; html: string }
      | undefined;
    expect(call?.to).toBe("admin@bijiyu.local");
    expect(call?.subject).toBe(
      "【ビジ友 運営】山田一郎 様（テスト建設株式会社）がアカウント設定を完了しました",
    );
    expect(call?.html).toContain("ビジ友管理者 様");
    expect(call?.html).toContain("【担当者氏名】 山田一郎");
    expect(call?.html).toContain("【会社名】 テスト建設株式会社");
    expect(call?.html).toContain("【メールアドレス】 client-target@test.local");
    expect(call?.html).toContain("【承諾日時】");
    expect(call?.html).toContain("現在、ご契約のお申し込みにお進みいただいています");
  });

  it("user_metadata なしでも従来どおり /mypage + §5.3.B は飛ばない", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u3" } },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    mockPriorPasswordSetAt(null);
    mockUpdatePasswordSetAt();

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/mypage");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("§5.3.B: password_set_at が既セットなら完了通知は重複発火しない (リロード等の 2 回目)", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u4",
          email: "client-target@test.local",
          user_metadata: {
            invited_company_name: "テスト",
            invited_last_name: "山",
            invited_first_name: "田",
          },
        },
      },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    // 既セット: 既に completed されている
    mockPriorPasswordSetAt("2026-06-28T01:00:00Z");
    mockUpdatePasswordSetAt();

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/billing");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("§5.3.B: audit_logs 逆引き 0 件なら sendEmail は呼ばずに redirect 進行", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u5",
          email: "client-target@test.local",
          user_metadata: {
            invited_company_name: "テスト",
            invited_last_name: "山",
            invited_first_name: "田",
          },
        },
      },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    mockPriorPasswordSetAt(null);
    mockUpdatePasswordSetAt();
    // audit_logs 不在
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("§5.3.B: admin user 行が見つからなければ sendEmail skip", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u6",
          email: "client-target@test.local",
          user_metadata: {
            invited_company_name: "テスト",
            invited_last_name: "山",
            invited_first_name: "田",
          },
        },
      },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    mockPriorPasswordSetAt(null);
    mockUpdatePasswordSetAt();
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { actor_id: "admin-1" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("§5.3.B: sendEmail が throw しても redirect は進む（非ブロッキング）", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u7",
          email: "client-target@test.local",
          user_metadata: {
            invited_company_name: "テスト",
            invited_last_name: "山",
            invited_first_name: "田",
          },
        },
      },
      error: null,
    });
    mockAuthUpdateUser.mockResolvedValue({ error: null });
    mockPriorPasswordSetAt(null);
    mockUpdatePasswordSetAt();
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: { data: { actor_id: "admin-1" }, error: null },
      }),
    );
    mockAdminFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: { email: "admin@bijiyu.local", last_name: "ビ", first_name: "管" },
          error: null,
        },
      }),
    );
    sendEmailMock.mockRejectedValueOnce(new Error("Resend down"));

    const r = await acceptInviteAction({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.redirectTo).toBe("/billing");
  });
});
