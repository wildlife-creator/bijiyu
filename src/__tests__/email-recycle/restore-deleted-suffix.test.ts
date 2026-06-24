import { beforeEach, describe, expect, it, vi } from "vitest";

import { restoreDeletedSuffix } from "@/lib/email-recycle/restore-deleted-suffix";

// ---------------------------------------------------------------------------
// admin client mock for restoreDeletedSuffix.
//
// 必要なモック面:
//   - admin.auth.admin.getUserById(userId)
//   - admin.auth.admin.updateUserById(userId, { email, email_confirm, ban_duration })
//   - admin.from('users').update({ deleted_at: null }).eq('id', ...)
//   - admin.from('audit_logs').insert(row)
// ---------------------------------------------------------------------------

type AuthError = { message: string; code?: string } | null;

const getUserById = vi.fn();
const updateUserById = vi.fn();
const userUpdateEq = vi.fn();
const userUpdate = vi.fn(() => ({ eq: userUpdateEq }));
const auditInsert = vi.fn();

function makeAdmin() {
  return {
    auth: {
      admin: {
        getUserById,
        updateUserById,
      },
    },
    from: (table: string) => {
      if (table === "users") {
        return { update: userUpdate };
      }
      if (table === "audit_logs") {
        return { insert: auditInsert };
      }
      throw new Error(`unexpected from(${table})`);
    },
  } as never;
}

beforeEach(() => {
  getUserById.mockReset();
  updateUserById.mockReset();
  userUpdate.mockReset();
  userUpdateEq.mockReset();
  auditInsert.mockReset();
  // デフォルト: 副作用の終端は成功
  userUpdate.mockImplementation(() => ({ eq: userUpdateEq }));
  userUpdateEq.mockResolvedValue({ data: null, error: null });
  auditInsert.mockResolvedValue({ error: null });
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SUFFIXED_EMAIL_4 = "deleted-20260624-a3f2-tanaka@bijiyu.jp";
const SUFFIXED_EMAIL_8 = "deleted-20260617-1a2b3c4d-tanaka@bijiyu.jp";
const ORIGINAL_EMAIL = "tanaka@bijiyu.jp";

describe("restoreDeletedSuffix", () => {
  it("正常系: 印を剥がして元 email に戻し、deleted_at クリア + ban 解除 + audit_logs auth_email_restored を 1 件", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: SUFFIXED_EMAIL_4 } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("restored");
    if (result.kind !== "restored") return;
    expect(result.originalEmail).toBe(ORIGINAL_EMAIL);

    // email + ban_duration: 'none' を 1 回の updateUserById で適用
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith(USER_ID, {
      email: ORIGINAL_EMAIL,
      email_confirm: true,
      ban_duration: "none",
    });

    // public.users.deleted_at を NULL に
    expect(userUpdate).toHaveBeenCalledWith({ deleted_at: null });
    expect(userUpdateEq).toHaveBeenCalledWith("id", USER_ID);

    // audit_logs: 1 件、metadata 構造
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_restored");
    expect(inserted.target_type).toBe("user");
    expect(inserted.target_id).toBe(USER_ID);
    expect(inserted.actor_id).toBeNull();
    expect(inserted.metadata).toMatchObject({
      invoked_by: "developer",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("バックフィル形式（8 文字）の印付き email も復元できる（貪欲マッチ）", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: SUFFIXED_EMAIL_8 } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("restored");
    if (result.kind !== "restored") return;
    expect(result.originalEmail).toBe(ORIGINAL_EMAIL);
  });

  it("email_collision: 原本 email が別 active user に取られている → rejected/email_collision + 失敗 audit", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: SUFFIXED_EMAIL_4 } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: null,
      error: { message: "email already exists", code: "email_exists" } as AuthError,
    });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.reason).toBe("email_collision");

    // 衝突時は副作用ゼロ: users UPDATE 走らない
    expect(userUpdate).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_restore_failed");
    expect(inserted.target_id).toBe(USER_ID);
    expect(inserted.actor_id).toBeNull();
    expect(inserted.metadata).toMatchObject({
      invoked_by: "developer",
      reason: "email_collision",
    });
  });

  it("not_suffixed: 印付き形式でない user → rejected/not_suffixed + 失敗 audit", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.reason).toBe("not_suffixed");

    expect(updateUserById).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_restore_failed");
    expect(inserted.metadata).toMatchObject({ reason: "not_suffixed" });
  });

  it("user_not_found: getUserById が user=null → rejected/user_not_found + 失敗 audit", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "User not found" },
    });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.reason).toBe("user_not_found");

    expect(updateUserById).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_restore_failed");
    expect(inserted.metadata).toMatchObject({ reason: "user_not_found" });
  });

  it("admin API 例外: email_exists 以外のエラーは failed/api_error + 失敗 audit", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: SUFFIXED_EMAIL_4 } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: null,
      error: { message: "Internal Server Error", code: "internal_error" } as AuthError,
    });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.reason).toBe("api_error");
    expect(result.error).toContain("Internal Server Error");

    expect(userUpdate).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_restore_failed");
    expect(inserted.metadata).toMatchObject({ reason: "api_error" });
  });

  it("audit_logs insert が失敗しても restored は維持される（業務継続）", async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: SUFFIXED_EMAIL_4 } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    auditInsert.mockReset();
    auditInsert.mockResolvedValueOnce({ error: { message: "RLS denied" } });

    const result = await restoreDeletedSuffix(makeAdmin(), USER_ID);

    expect(result.kind).toBe("restored");
  });
});
