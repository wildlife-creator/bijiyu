import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorage = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
      storage: { from: mockStorage },
    }),
  ),
}));

// Import after mock
const { applyJobAction, toggleFavoriteAction } = await import(
  "@/app/(authenticated)/jobs/search-actions"
);

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
