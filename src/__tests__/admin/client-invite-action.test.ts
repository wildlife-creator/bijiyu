import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createClientInviteAction（ADM-006/007 管理責任者 新規作成）のテスト。
 * - public.users での email 重複事前チェック
 * - metadata に invited_role を**付けない**（handle_new_user の staff 化防止）
 * - 招待メール送信失敗時の deleteUser クリーンアップ（幽霊アカウント防止）
 * - audit log（admin_client_invite）
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
  existingUser: null as null | { id: string },
  /** §5.2.B 用: admin 本人の users 行（email + 姓名） */
  adminProfile: null as null | {
    email: string;
    last_name: string | null;
    first_name: string | null;
  },
  inviteResult: {
    data: { user: { id: "new-user-1" } } as { user: { id: string } | null },
    error: null as null | { message: string; code?: string },
  },
};

const mockInviteUserByEmail = vi.fn();
const mockDeleteUser = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: (...args: unknown[]) =>
          mockInviteUserByEmail(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: (table: string) => {
      // .eq() の col/val を保持しておき、maybeSingle で query を区別する。
      // - .eq('email', x) → email 重複事前チェック → existingUser を返す
      // - .eq('id', x)    → §5.2.B 用 admin 本人ルックアップ → adminProfile を返す
      const state: { col?: string; val?: unknown } = {};
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(function (col: string, val: unknown) {
          state.col = col;
          state.val = val;
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table !== "users") return { data: null, error: null };
          if (state.col === "email") {
            return { data: adminState.existingUser, error: null };
          }
          if (state.col === "id") {
            return { data: adminState.adminProfile, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    },
  }),
}));

const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  maskEmail: (email: string) => {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***";
    return `${local[0]}***@${domain}`;
  },
}));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Map([
      ["host", "127.0.0.1:3000"],
      ["x-forwarded-proto", "http"],
    ]),
}));

import { createClientInviteAction } from "@/app/admin/(protected)/clients/new/actions";

function buildFormData(
  overrides: Partial<Record<string, string>> = {},
): FormData {
  const fd = new FormData();
  fd.set("companyName", overrides.companyName ?? "テスト建設株式会社");
  fd.set("lastName", overrides.lastName ?? "田中");
  fd.set("firstName", overrides.firstName ?? "一郎");
  fd.set("email", overrides.email ?? "invite-target@test.local");
  return fd;
}

beforeEach(() => {
  authState.user = { id: "admin-1" };
  authState.role = "admin";
  adminState.existingUser = null;
  adminState.adminProfile = {
    email: "admin@bijiyu.local",
    last_name: "ビジ友",
    first_name: "管理者",
  };
  adminState.inviteResult = {
    data: { user: { id: "new-user-1" } },
    error: null,
  };
  mockInviteUserByEmail
    .mockReset()
    .mockImplementation(async () => adminState.inviteResult);
  mockDeleteUser.mockReset().mockResolvedValue({ data: null, error: null });
  mockWriteAuditLog.mockClear();
  mockRedirect.mockClear();
  mockSendEmail.mockReset().mockResolvedValue({ success: true });
});

describe("createClientInviteAction", () => {
  it("非 admin は拒否", async () => {
    authState.role = "client";
    const result = await createClientInviteAction(buildFormData());
    expect(result.success).toBe(false);
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it("必須項目欠落はバリデーションエラー", async () => {
    const result = await createClientInviteAction(
      buildFormData({ companyName: "" }),
    );
    expect(result.success).toBe(false);
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it("メール重複は「このメールアドレスは既に登録されています」", async () => {
    adminState.existingUser = { id: "existing-1" };
    const result = await createClientInviteAction(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("このメールアドレスは既に登録されています");
    }
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it("metadata に invited_role が含まれない（氏名・会社名のみ）", async () => {
    await expect(createClientInviteAction(buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/clients",
    );

    expect(mockInviteUserByEmail).toHaveBeenCalledTimes(1);
    const [email, options] = mockInviteUserByEmail.mock.calls[0] as [
      string,
      { data: Record<string, unknown>; redirectTo: string },
    ];
    expect(email).toBe("invite-target@test.local");
    expect(options.data).toEqual({
      invited_last_name: "田中",
      invited_first_name: "一郎",
      invited_company_name: "テスト建設株式会社",
    });
    expect(options.data).not.toHaveProperty("invited_role");
    expect(options.redirectTo).toBe(
      "http://127.0.0.1:3000/accept-invite/confirm",
    );
  });

  it("成功時に audit log（admin_client_invite）を記録する", async () => {
    await expect(createClientInviteAction(buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/clients",
    );

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_client_invite",
        actorId: "admin-1",
        targetId: "new-user-1",
        metadata: expect.objectContaining({
          company_name: "テスト建設株式会社",
        }),
      }),
    );
  });

  it("招待送信失敗時は deleteUser でクリーンアップする（幽霊アカウント防止）", async () => {
    adminState.inviteResult = {
      data: { user: { id: "ghost-user-1" } },
      error: { message: "SMTP error" },
    };

    const result = await createClientInviteAction(buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "アカウントの作成に失敗しました。時間をおいて再度お試しください",
      );
    }
    expect(mockDeleteUser).toHaveBeenCalledWith("ghost-user-1");
  });

  it("invite 段階で重複検出された場合も重複メッセージを返す", async () => {
    adminState.inviteResult = {
      data: { user: null },
      error: { message: "User already registered", code: "email_exists" },
    };

    const result = await createClientInviteAction(buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("このメールアドレスは既に登録されています");
    }
    expect(mockDeleteUser).not.toHaveBeenCalled();
    // invite 失敗時は §5.2.B も飛ばない
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("成功時に §5.2.B 控えメールが操作した admin 本人宛に 1 通飛ぶ", async () => {
    await expect(createClientInviteAction(buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/clients",
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe("admin@bijiyu.local");
    expect(call.subject).toBe(
      "【ビジ友 運営】田中一郎 様（テスト建設株式会社）を発注者として招待しました",
    );
    expect(call.html).toContain("ビジ友管理者 様");
    expect(call.html).toContain("田中一郎");
    expect(call.html).toContain("テスト建設株式会社");
    expect(call.html).toContain("invite-target@test.local");
    expect(call.html).toContain("【招待日時】");
  });

  it("admin の email が DB から取れなければ §5.2.B はサイレント skip（リダイレクトは進む）", async () => {
    adminState.adminProfile = null;

    await expect(createClientInviteAction(buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/clients",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("§5.2.B sendEmail が throw してもリダイレクトは止まらない（非ブロッキング）", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("Resend down"));

    await expect(createClientInviteAction(buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/clients",
    );
  });
});
