import { describe, expect, it, vi, beforeEach } from "vitest";

import { resolveExistingProxyReuse } from "@/lib/organization/resolve-existing-proxy-reuse";

// ---------------------------------------------------------------------------
// Minimal admin client mock (covers .from().select().eq() chain + .maybeSingle()
// terminator for users, and thenable for organization_members 配列 SELECT)
// ---------------------------------------------------------------------------
interface QueryTerminator {
  maybeSingle?: { data: unknown; error: unknown };
  thenable?: { data: unknown; error: unknown };
}

function createQueryMock(t: QueryTerminator = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      t.maybeSingle ?? { data: null, error: null },
    ),
  };
  if (t.thenable) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({
          data: t.thenable?.data ?? null,
          error: t.thenable?.error ?? null,
        }),
    });
  }
  return chain;
}

const mockFrom = vi.fn();

function makeAdmin() {
  // Reset between tests via beforeEach
  return { from: (...args: unknown[]) => mockFrom(...args) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

const baseInput = {
  email: "candidate@test.local",
  lastName: "山田",
  firstName: "太郎",
  isProxyAccount: true,
} as const;

// ===========================================================================
// resolveExistingProxyReuse
// ===========================================================================
describe("resolveExistingProxyReuse", () => {
  it("既存ユーザーなし → new_user", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );
    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({ kind: "new_user" });
  });

  it("既存ユーザーが論理削除済み (deleted_at セット) → new_user (退会後の再登録)", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-deleted",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: "2026-01-01T00:00:00Z",
          },
          error: null,
        },
      }),
    );
    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({ kind: "new_user" });
    // 削除済みユーザーの場合、organization_members SELECT を発行しない
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("既存ユーザーが代理在籍なし → reject_email_taken", async () => {
    // SELECT users → 既存ユーザー
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-regular",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    // SELECT organization_members → 代理在籍なし (空配列)
    mockFrom.mockReturnValueOnce(
      createQueryMock({ thenable: { data: [], error: null } }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({ kind: "reject_email_taken" });
  });

  it("既存ユーザーが代理在籍中で input.isProxyAccount=false → reject_email_taken (通常スタッフ招待は再利用不可)", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-proxy",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ organization_id: "org-other" }], error: null },
      }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), {
      ...baseInput,
      isProxyAccount: false,
    });
    expect(result).toEqual({ kind: "reject_email_taken" });
  });

  it("代理在籍中で氏名一致 (姓+名 結合) → reuse_existing_proxy + userId 返却", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-proxy",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ organization_id: "org-other" }], error: null },
      }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({
      kind: "reuse_existing_proxy",
      userId: "user-proxy",
    });
  });

  it("代理在籍中で氏名不一致 → reject_name_mismatch", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-proxy",
            last_name: "佐藤",
            first_name: "花子",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ organization_id: "org-other" }], error: null },
      }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({ kind: "reject_name_mismatch" });
  });

  it("プライバシー保護: ReuseDecision のキーに `name` 等の既存氏名情報が含まれない", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-proxy",
            last_name: "佐藤",
            first_name: "花子",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ organization_id: "org-other" }], error: null },
      }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    // serialize and verify no name leakage
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("佐藤");
    expect(serialized).not.toContain("花子");
    expect(serialized).not.toContain("last_name");
    expect(serialized).not.toContain("first_name");
  });

  it("N 組織兼任 (proxy 行が複数) → 1 件でもあれば reuse_existing_proxy 判定で OK", async () => {
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-multi-proxy",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: {
          data: [
            { organization_id: "org-x" },
            { organization_id: "org-y" },
            { organization_id: "org-z" },
          ],
          error: null,
        },
      }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({
      kind: "reuse_existing_proxy",
      userId: "user-multi-proxy",
    });
  });

  // ===========================================================================
  // Task 6: deleted_at IS NULL フィルタ追加
  // ===========================================================================
  it("Task 6: 同 email で deleted + active が並存 → `.is('deleted_at', null)` フィルタで active 行のみが拾われる", async () => {
    // フィルタが効いている前提のため maybeSingle が返すのは active 行 1 件のみ
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        maybeSingle: {
          data: {
            id: "user-active",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
          },
          error: null,
        },
      }),
    );
    // active 行が代理在籍中 → reuse_existing_proxy パスに進む
    mockFrom.mockReturnValueOnce(
      createQueryMock({
        thenable: { data: [{ organization_id: "org-x" }], error: null },
      }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({
      kind: "reuse_existing_proxy",
      userId: "user-active",
    });

    // SELECT users チェーンで `.is("deleted_at", null)` が呼ばれていること
    const usersBuilder = mockFrom.mock.results[0]?.value as {
      is: ReturnType<typeof vi.fn>;
    };
    expect(usersBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("Task 6: 全行 deleted (フィルタ後 0 件) → maybeSingle null → new_user", async () => {
    // active 行が無いため maybeSingle は null を返す
    mockFrom.mockReturnValueOnce(
      createQueryMock({ maybeSingle: { data: null, error: null } }),
    );

    const result = await resolveExistingProxyReuse(makeAdmin(), baseInput);
    expect(result).toEqual({ kind: "new_user" });

    // active 行が無いため organization_members SELECT は発行されない
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});
