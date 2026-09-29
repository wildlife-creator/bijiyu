import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup - vi.mock factories cannot reference outer variables
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// closeJobAction は admin client / master / org context を使わないが、
// 同じモジュール (jobs/actions.ts) が import するため副作用のないモックに置き換える。
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/organization/active-org-context", () => ({
  getActiveOrganizationContext: vi.fn(),
}));

// master/fetch は unstable_cache を呼ぶため直接モック
vi.mock("@/lib/master/fetch", () => ({
  getActiveTradeTypes: vi.fn().mockResolvedValue([]),
  getAllMasterRows: vi.fn().mockResolvedValue([]),
  getAllMasterRowsOrThrow: vi.fn().mockResolvedValue([]),
}));

import { closeJobAction } from "@/app/(authenticated)/jobs/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const FAILURE_MESSAGE =
  "掲載終了に失敗しました。時間をおいて再度お試しください";

/**
 * Create a chainable mock for Supabase query builder.
 * Supports: .select().update().eq().is().single()
 * The `terminator` controls what the final call returns.
 */
function createQueryMock(terminator: { single?: unknown; default?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.update = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.is = vi.fn(self);
  chain.single = vi.fn().mockResolvedValue(terminator.single);
  // For direct awaiting (no terminator)
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve(terminator.default ?? terminator.single);
  return chain;
}

function mockAuthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
}

function buildJob(status: string) {
  return {
    id: JOB_ID,
    owner_id: USER_ID,
    organization_id: null,
    status,
  };
}

// ---------------------------------------------------------------------------
// closeJobAction
// ---------------------------------------------------------------------------
describe("closeJobAction", () => {
  beforeEach(() => {
    // mockReturnValueOnce のキューを確実に消すため mockReset を使う
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it("未認証の場合はエラーを返し、jobs を参照しない", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });

    const result = await closeJobAction(JOB_ID);

    expect(result).toEqual({
      success: false,
      error: "認証情報が見つかりません。再度ログインしてください。",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("案件が見つからない場合（data が null）はエラーを返し、更新しない", async () => {
    mockAuthenticated();
    const selectQuery = createQueryMock({
      single: {
        data: null,
        error: { code: "PGRST116", message: "no rows returned" },
      },
    });
    mockFrom.mockReturnValueOnce(selectQuery);

    const result = await closeJobAction(JOB_ID);

    expect(result).toEqual({ success: false, error: "案件が見つかりません" });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("jobs");
    expect(selectQuery.eq).toHaveBeenCalledWith("id", JOB_ID);
    expect(selectQuery.is).toHaveBeenCalledWith("deleted_at", null);
    expect(selectQuery.update).not.toHaveBeenCalled();
  });

  it.each(["draft", "closed"])(
    "案件のステータスが %s（掲載中でない）の場合はエラーを返し、更新しない",
    async (status) => {
      mockAuthenticated();
      const selectQuery = createQueryMock({
        single: { data: buildJob(status), error: null },
      });
      mockFrom.mockReturnValueOnce(selectQuery);

      const result = await closeJobAction(JOB_ID);

      expect(result).toEqual({
        success: false,
        error: "この案件は現在掲載中ではありません",
      });
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(selectQuery.update).not.toHaveBeenCalled();
    }
  );

  it("更新でエラーが返った場合（RLS 拒否等）は失敗メッセージを返す", async () => {
    mockAuthenticated();
    const selectQuery = createQueryMock({
      single: { data: buildJob("open"), error: null },
    });
    const updateQuery = createQueryMock({
      default: {
        data: null,
        error: { code: "42501", message: "permission denied" },
      },
    });
    mockFrom.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

    const result = await closeJobAction(JOB_ID);

    expect(result).toEqual({ success: false, error: FAILURE_MESSAGE });
    expect(updateQuery.update).toHaveBeenCalledWith({ status: "closed" });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", JOB_ID);
  });

  it("掲載中の案件は closed に更新して成功を返す", async () => {
    mockAuthenticated();
    const selectQuery = createQueryMock({
      single: { data: buildJob("open"), error: null },
    });
    const updateQuery = createQueryMock({
      default: { data: null, error: null },
    });
    mockFrom.mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery);

    const result = await closeJobAction(JOB_ID);

    expect(result).toEqual({ success: true });
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "jobs");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "jobs");
    expect(selectQuery.select).toHaveBeenCalledWith(
      "id, owner_id, organization_id, status"
    );
    expect(selectQuery.eq).toHaveBeenCalledWith("id", JOB_ID);
    expect(updateQuery.update).toHaveBeenCalledTimes(1);
    expect(updateQuery.update).toHaveBeenCalledWith({ status: "closed" });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", JOB_ID);
  });

  it("予期しない例外が発生した場合は失敗メッセージを返す", async () => {
    mockGetUser.mockRejectedValue(new Error("network down"));

    const result = await closeJobAction(JOB_ID);

    expect(result).toEqual({ success: false, error: FAILURE_MESSAGE });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
