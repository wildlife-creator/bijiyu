import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §5.8 PW リセット申請メール (resetPasswordAction) と
 * §5.8.A 完了通知配線 (updatePasswordAction) のテスト。
 *
 * - resetPasswordAction: redirectTo を host header から動的に組む（CLAUDE.md ルール準拠）
 * - updatePasswordAction: PW 設定成功時のみ §5.8.A 完了通知が fire-and-forget で飛ぶ
 */

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockAdminFrom = vi.fn();
const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
const mockHeaders = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      resetPasswordForEmail: (...args: unknown[]) =>
        mockResetPasswordForEmail(...args),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

import { resetPasswordAction } from "@/app/(auth)/reset-password/actions";
import { updatePasswordAction } from "@/app/(auth)/reset-password/confirm/actions";

beforeEach(() => {
  mockGetUser.mockReset();
  mockUpdateUser.mockReset();
  mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mockAdminFrom.mockReset();
  mockSendEmail.mockReset().mockResolvedValue({ success: true });
  mockHeaders.mockReset();
});

function makeHeaders(values: Record<string, string>) {
  return {
    get: (key: string) => values[key.toLowerCase()] ?? null,
  };
}

function setupAdminUser(profile: {
  email: string | null;
  last_name: string | null;
  first_name: string | null;
}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
  };
  mockAdminFrom.mockReturnValue(chain);
  return chain;
}

describe("resetPasswordAction (§5.8)", () => {
  it("バリデーション失敗時は早期 return で Supabase Auth を呼ばない", async () => {
    const result = await resetPasswordAction({ email: "not-an-email" });

    expect(result.success).toBe(false);
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("host header から redirectTo を組み立てる（127.0.0.1:3000）", async () => {
    mockHeaders.mockResolvedValue(
      makeHeaders({ host: "127.0.0.1:3000" }),
    );

    const result = await resetPasswordAction({
      email: "user@test.local",
    });

    expect(result.success).toBe(true);
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "user@test.local",
      expect.objectContaining({
        redirectTo:
          "http://127.0.0.1:3000/auth/callback?next=/reset-password/confirm",
      }),
    );
  });

  it("x-forwarded-proto があれば proto を優先（https）", async () => {
    mockHeaders.mockResolvedValue(
      makeHeaders({
        host: "bijiyu.com",
        "x-forwarded-proto": "https",
      }),
    );

    await resetPasswordAction({ email: "user@test.local" });

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "user@test.local",
      expect.objectContaining({
        redirectTo:
          "https://bijiyu.com/auth/callback?next=/reset-password/confirm",
      }),
    );
  });

  it("Supabase Auth がエラーを返してもアカウント列挙防止のため success: true を返す", async () => {
    mockHeaders.mockResolvedValue(
      makeHeaders({ host: "127.0.0.1:3000" }),
    );
    mockResetPasswordForEmail.mockResolvedValue({
      error: { message: "User not found" },
    });

    const result = await resetPasswordAction({ email: "ghost@test.local" });

    expect(result.success).toBe(true);
  });
});

describe("updatePasswordAction (§5.8.A)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: "user-uuid-1", email: "user@test.local" },
      },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  it("バリデーション失敗時は updateUser もメール送信も呼ばない", async () => {
    const result = await updatePasswordAction({
      password: "short",
      confirmPassword: "short",
    });

    expect(result.success).toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("PW 設定成功時、完了通知メールが本人宛に飛ぶ", async () => {
    setupAdminUser({
      email: "user@test.local",
      last_name: "山田",
      first_name: "太郎",
    });

    const result = await updatePasswordAction({
      password: "valid1234",
      confirmPassword: "valid1234",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ redirectTo: "/login" });
    }
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sendCall = mockSendEmail.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(sendCall.to).toBe("user@test.local");
    expect(sendCall.subject).toBe(
      "【ビジ友】パスワードの変更が完了しました",
    );
    expect(sendCall.html).toContain("山田太郎 様");
  });

  it("PW 設定失敗時（expired）は完了通知メールを送らない", async () => {
    mockUpdateUser.mockResolvedValue({
      error: { message: "Token has expired or is invalid" },
    });

    const result = await updatePasswordAction({
      password: "valid1234",
      confirmPassword: "valid1234",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("有効期限");
    }
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("メール送信失敗時もリダイレクトは進む（非ブロッキング）", async () => {
    setupAdminUser({
      email: "user@test.local",
      last_name: "山田",
      first_name: "太郎",
    });
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    const result = await updatePasswordAction({
      password: "valid1234",
      confirmPassword: "valid1234",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ redirectTo: "/login" });
    }
  });

  it("admin client から取得した姓名がなければ「ご利用者」フォールバック", async () => {
    setupAdminUser({
      email: "user@test.local",
      last_name: null,
      first_name: null,
    });

    await updatePasswordAction({
      password: "valid1234",
      confirmPassword: "valid1234",
    });

    const sendCall = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(sendCall.html).toContain("ご利用者 様");
  });
});
