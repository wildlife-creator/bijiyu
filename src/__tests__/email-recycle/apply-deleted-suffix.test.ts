import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";

// ---------------------------------------------------------------------------
// Lightweight admin client mock for applyDeletedSuffix.
//
// 必要なモック面:
//   - admin.auth.admin.getUserById(userId) → { data: { user: { id, email } }, error }
//   - admin.auth.admin.updateUserById(userId, { email, email_confirm }) → { data, error }
//   - admin.from('audit_logs').insert(row) → { error }
//
// once-queue を beforeEach で mockReset することで CLAUDE.md ルール準拠
// （vi.clearAllMocks は once キューを残すため）。
// ---------------------------------------------------------------------------

type AuthError = { message: string; code?: string } | null;

interface GetUserMock {
  data: { user: { id: string; email: string | null } | null };
  error: AuthError;
}

interface UpdateUserMock {
  data: { user: { id: string; email: string } | null } | null;
  error: AuthError;
}

const getUserById = vi.fn();
const updateUserById = vi.fn();
const auditInsert = vi.fn();
const rpc = vi.fn();

function makeAdmin() {
  return {
    auth: {
      admin: {
        getUserById,
        updateUserById,
      },
    },
    from: (table: string) => {
      if (table !== "audit_logs") {
        throw new Error(
          `unexpected from(${table}) — applyDeletedSuffix should only insert audit_logs`,
        );
      }
      return { insert: auditInsert };
    },
    rpc,
  } as never;
}

beforeEach(() => {
  getUserById.mockReset();
  updateUserById.mockReset();
  auditInsert.mockReset();
  rpc.mockReset();
  auditInsert.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ error: null });
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_EMAIL = "tanaka@bijiyu.jp";

function mockGetUser(result: GetUserMock) {
  getUserById.mockResolvedValueOnce(result);
}

function mockUpdateUser(result: UpdateUserMock) {
  updateUserById.mockResolvedValueOnce(result);
}

describe("applyDeletedSuffix", () => {
  it("正常系: auth.users.email を印付け書き換え + audit_logs に auth_email_recycled を 1 件 insert する", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    mockUpdateUser({
      data: { user: { id: USER_ID, email: "stub" } },
      error: null,
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    // 印付き形式: deleted-{YYYYMMDD}-{ランダム4文字 [a-z0-9]}-{元ローカル部}@{元ドメイン}
    expect(result.recycledEmail).toMatch(
      /^deleted-\d{8}-[a-z0-9]{4}-tanaka@bijiyu\.jp$/,
    );

    // updateUserById が email_confirm: true で呼ばれること（bounce 抑止）
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith(USER_ID, {
      email: result.recycledEmail,
      email_confirm: true,
    });

    // audit_logs: 成功記録 1 件
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_recycled");
    expect(inserted.target_type).toBe("user");
    expect(inserted.target_id).toBe(USER_ID);
    expect(inserted.actor_id).toBe(ACTOR_ID);
    expect(inserted.metadata).toMatchObject({
      path: "staff_delete",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    // metadata に元 email を含めない（個人情報二重保存回避）
    expect(JSON.stringify(inserted.metadata)).not.toContain(ORIGINAL_EMAIL);

    // auth.identities 同期 RPC が呼ばれる
    expect(rpc).toHaveBeenCalledWith("email_recycle_sync_identity", {
      p_user_id: USER_ID,
      p_from_email: ORIGINAL_EMAIL,
      p_to_email: result.recycledEmail,
    });
  });

  it("auth.identities 同期 RPC が失敗しても applied は維持される（業務継続）", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    mockUpdateUser({
      data: { user: { id: USER_ID, email: "stub" } },
      error: null,
    });
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ error: { message: "rpc broke" } });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result.kind).toBe("applied");
  });

  it("冪等性: 既に印付き形式の email なら no-op で already_suffixed を返し audit_logs に書かない", async () => {
    mockGetUser({
      data: {
        user: {
          id: USER_ID,
          email: "deleted-20260624-a3f2-tanaka@bijiyu.jp",
        },
      },
      error: null,
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result).toEqual({ kind: "already_suffixed" });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("冪等性: バックフィル形式（8 文字）の email も already_suffixed として検出する", async () => {
    mockGetUser({
      data: {
        user: {
          id: USER_ID,
          email: "deleted-20260617-1a2b3c4d-tanaka@bijiyu.jp",
        },
      },
      error: null,
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result).toEqual({ kind: "already_suffixed" });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("リトライ: 1 回目衝突（email_exists）→ 2 回目成功で applied", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    // 1 回目: email_exists で衝突
    mockUpdateUser({
      data: null,
      error: { message: "A user with this email address already exists", code: "email_exists" },
    });
    // 2 回目: 成功
    mockUpdateUser({
      data: { user: { id: USER_ID, email: "stub" } },
      error: null,
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "subscription_deleted",
      actorId: null,
    });

    expect(result.kind).toBe("applied");
    expect(updateUserById).toHaveBeenCalledTimes(2);

    // 2 回の更新試行で異なる random token が使われていること（再生成されている）
    const call1Email = (
      updateUserById.mock.calls[0]?.[1] as { email: string }
    ).email;
    const call2Email = (
      updateUserById.mock.calls[1]?.[1] as { email: string }
    ).email;
    expect(call1Email).not.toBe(call2Email);
    expect(call1Email).toMatch(/^deleted-\d{8}-[a-z0-9]{4}-tanaka@bijiyu\.jp$/);
    expect(call2Email).toMatch(/^deleted-\d{8}-[a-z0-9]{4}-tanaka@bijiyu\.jp$/);

    // 成功時のみ audit_logs に 1 件 insert（衝突はリトライで吸収、失敗ログ無し）
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_recycled");
    expect(inserted.actor_id).toBeNull();
  });

  it("リトライ上限: 3 回連続衝突 → skipped/max_retries_exceeded + audit_logs に失敗記録", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    for (let i = 0; i < 3; i++) {
      mockUpdateUser({
        data: null,
        error: { message: "email_exists", code: "email_exists" },
      });
    }

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "self_withdrawal",
      actorId: USER_ID,
    });

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    expect(result.reason).toBe("max_retries_exceeded");
    expect(updateUserById).toHaveBeenCalledTimes(3);

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_recycle_failed");
    expect(inserted.target_id).toBe(USER_ID);
    expect(inserted.metadata).toMatchObject({
      path: "self_withdrawal",
      reason: "max_retries_exceeded",
    });
  });

  it("admin API 例外: email_exists 以外のエラーは failed/api_error + 失敗 audit を 1 件", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    mockUpdateUser({
      data: null,
      error: { message: "Internal Server Error", code: "internal_error" },
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.reason).toBe("api_error");
    expect(result.error).toContain("Internal Server Error");

    // リトライしない（衝突以外）
    expect(updateUserById).toHaveBeenCalledTimes(1);

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_recycle_failed");
    expect(inserted.metadata).toMatchObject({
      path: "staff_delete",
      reason: "api_error",
    });
  });

  it("不正形式: 元 email が @ を含まない → skipped/invalid_format + 失敗 audit", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: "not-an-email" } },
      error: null,
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    expect(result.reason).toBe("invalid_format");
    expect(updateUserById).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_recycle_failed");
    expect(inserted.metadata).toMatchObject({
      path: "staff_delete",
      reason: "invalid_format",
    });
  });

  it("user_not_found: getUserById が user=null → skipped/user_not_found + 失敗 audit", async () => {
    mockGetUser({
      data: { user: null },
      error: { message: "User not found" },
    });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    expect(result.reason).toBe("user_not_found");
    expect(updateUserById).not.toHaveBeenCalled();

    expect(auditInsert).toHaveBeenCalledTimes(1);
    const inserted = auditInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe("auth_email_recycle_failed");
    expect(inserted.metadata).toMatchObject({
      path: "staff_delete",
      reason: "user_not_found",
    });
  });

  it("audit_logs insert 失敗時も applied を返し、業務処理は止めない", async () => {
    mockGetUser({
      data: { user: { id: USER_ID, email: ORIGINAL_EMAIL } },
      error: null,
    });
    mockUpdateUser({
      data: { user: { id: USER_ID, email: "stub" } },
      error: null,
    });
    auditInsert.mockReset();
    auditInsert.mockResolvedValueOnce({ error: { message: "RLS denied" } });

    const result = await applyDeletedSuffix(makeAdmin(), USER_ID, {
      path: "staff_delete",
      actorId: ACTOR_ID,
    });

    expect(result.kind).toBe("applied");
  });
});
