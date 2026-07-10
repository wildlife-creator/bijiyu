import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorage = vi.fn();
const mockAdminFrom = vi.fn();

// 修正2: applyJobAction のスカウト受諾フラグ更新で使う admin client の update payload を記録
const adminUpdateCalls: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
      storage: { from: mockStorage },
    }),
  ),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Import after mock
const { applyJobAction, toggleFavoriteAction } = await import(
  "@/app/(authenticated)/jobs/search-actions"
);

/**
 * admin client 用のチェーンモック。update の payload を adminUpdateCalls に記録し、
 * single/maybeSingle は {data:null} を返す（sendApplicationEmails は job=null で
 * 早期 return するのでメール送信には到達しない）。
 */
function createAdminQueryMock() {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "insert",
    "delete",
    "eq",
    "neq",
    "in",
    "is",
    "gte",
    "or",
    "order",
    "range",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.update = vi.fn((payload: unknown) => {
    adminUpdateCalls.push(payload);
    return chain;
  });
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: null, error: null }),
  );
  return chain;
}

// Helper: build chained query mock
function createQueryMock(result: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "is",
    "gte",
    "or",
    "order",
    "range",
    "maybeSingle",
    "single",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal methods return the result
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
}

describe("applyJobAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminUpdateCalls.length = 0;
  });

  // RFC 4122 準拠 UUID（scoutMessageId は z.string().uuid() で厳密検証されるため）
  const JOB_ID = "66666666-6666-6666-6666-666666666666";
  const SCOUT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER_JOB_ID = "77777777-7777-7777-7777-777777777777";
  const THREAD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  function setupClientScoutPath(scoutJobId: string) {
    mockGetUser.mockResolvedValue({ data: { user: { id: "contractor-1" } } });
    mockFrom
      // 1. users role → client（有料扱いで free チェックを skip）
      .mockReturnValueOnce(createQueryMock({ data: { role: "client" } }))
      // 2. jobs → open
      .mockReturnValueOnce(
        createQueryMock({
          data: { id: JOB_ID, status: "open", trade_types: ["躯体｜大工"] },
        }),
      )
      // 3. applications 重複チェック → なし
      .mockReturnValueOnce(createQueryMock({ data: null }))
      // 4. subscriptions → なし（role=client なので isPaidUser=true）
      .mockReturnValueOnce(createQueryMock({ data: null }))
      // 5. messages スカウト検証 → is_scout, job_id, thread_id
      .mockReturnValueOnce(
        createQueryMock({
          data: {
            id: SCOUT_ID,
            is_scout: true,
            job_id: scoutJobId,
            thread_id: THREAD_ID,
          },
        }),
      )
      // 6. applications insert → 成功
      .mockReturnValueOnce(createQueryMock({ data: { id: "app-1" } }));
    mockAdminFrom.mockReturnValue(createAdminQueryMock());
  }

  it("修正2: スカウト経由の応募が成功すると scout_status を accepted に更新する", async () => {
    setupClientScoutPath(JOB_ID);

    const fd = buildFormData({
      jobId: JOB_ID,
      headcount: "1",
      workingType: "常勤",
      preferredFirstWorkDate: "2026-05-01",
      scoutMessageId: SCOUT_ID,
    });
    const result = await applyJobAction(fd);

    expect(result.success).toBe(true);
    // 応募送信成功時に scout_status を accepted へ更新している
    expect(adminUpdateCalls).toContainEqual({ scout_status: "accepted" });
  });

  it("修正2: scout_message_id が別案件のスカウトなら応募を拒否する", async () => {
    // scout の job_id が応募先 jobId と異なる → 早期に拒否（insert に到達しない）
    setupClientScoutPath(OTHER_JOB_ID);

    const fd = buildFormData({
      jobId: JOB_ID,
      headcount: "1",
      workingType: "常勤",
      preferredFirstWorkDate: "2026-05-01",
      scoutMessageId: SCOUT_ID,
    });
    const result = await applyJobAction(fd);

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("スカウトメッセージが見つかりません。");
    // 拒否されているので受諾フラグ更新は行われない
    expect(adminUpdateCalls).toHaveLength(0);
  });

  it("未認証の場合はエラーを返す", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const fd = buildFormData({ jobId: "66666666-6666-6666-6666-666666666666" });
    const result = await applyJobAction(fd);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("Zod バリデーションエラーの場合はエラーを返す", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    // Role check
    const roleQuery = createQueryMock({
      data: { role: "contractor" },
    });
    mockFrom.mockReturnValue(roleQuery);

    const fd = buildFormData({
      jobId: "invalid-id",
      headcount: "0",
      workingType: "",
      preferredFirstWorkDate: "",
    });

    const result = await applyJobAction(fd);
    expect(result.success).toBe(false);
  });
});

describe("toggleFavoriteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証の場合はエラーを返す", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const fd = buildFormData({
      targetType: "job",
      targetId: "66666666-6666-6666-6666-666666666666",
    });
    const result = await toggleFavoriteAction(fd);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("target_type が不正な場合はエラーを返す", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    // Role: contractor
    const roleQuery = createQueryMock({
      data: { role: "contractor" },
    });
    mockFrom.mockReturnValue(roleQuery);

    const fd = buildFormData({
      targetType: "user", // contractor can't favorite users
      targetId: "66666666-6666-6666-6666-666666666666",
    });

    const result = await toggleFavoriteAction(fd);
    expect(result.success).toBe(false);
  });

  it("パラメータ不足の場合はエラーを返す", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const fd = new FormData(); // empty
    const result = await toggleFavoriteAction(fd);
    expect(result.success).toBe(false);
  });
});
