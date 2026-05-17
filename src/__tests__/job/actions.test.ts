import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup - vi.mock factories cannot reference outer variables
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  }),
}));

// master/fetch は unstable_cache を呼ぶため Jest 環境では直接モック。
// validateLabelChanges は added 配列のみ active 必須にする検証なので、
// テストで使う label を active として返せば save パスを通せる。
vi.mock("@/lib/master/fetch", () => {
  const MOCK_TRADES = [
    { label: "大工", deprecated_at: null },
    { label: "内装工", deprecated_at: null },
    { label: "塗装工", deprecated_at: null },
  ];
  return {
    getActiveTradeTypes: vi
      .fn()
      .mockResolvedValue(MOCK_TRADES.map((r) => r.label)),
    getActiveQualifications: vi.fn().mockResolvedValue([]),
    getActiveSkillTags: vi.fn().mockResolvedValue([]),
    getAllMasterRows: vi.fn().mockImplementation((kind: string) => {
      if (kind === "trade-types") {
        return Promise.resolve(MOCK_TRADES);
      }
      return Promise.resolve([]);
    }),
  };
});

import {
  createJobAction,
  updateJobAction,
  deleteJobImageAction,
} from "@/app/(authenticated)/jobs/actions";
import { getAllMasterRows } from "@/lib/master/fetch";

const mockedGetAllMasterRows = vi.mocked(getAllMasterRows);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildValidFormData(overrides: Record<string, string> = {}): FormData {
  const defaults: Record<string, string> = {
    title: "テスト案件",
    description: "テスト詳細説明です",
    rewardLower: "18000",
    rewardUpper: "22000",
    prefecture: "東京都",
    address: "",
    workStartDate: "2026-04-01",
    workEndDate: "2026-06-30",
    recruitStartDate: "2026-03-15",
    recruitEndDate: "2026-03-31",
    headcount: "3",
    workHours: "",
    experienceYears: "",
    requiredSkills: "",
    items: "",
    scheduleDetail: "",
    projectDetails: "",
    ownerMessage: "",
    location: "",
    etcMessage: "",
    status: "draft",
  };

  const formData = new FormData();
  const merged = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    formData.set(key, value);
  }
  // tradeTypes は配列なので append（formData.getAll("tradeTypes") で受け取る）
  formData.append("tradeTypes", "大工");
  return formData;
}

/**
 * Create a chainable mock for Supabase query builder.
 * Supports: .select().eq().is().in().order().range().single().maybeSingle()
 * The `terminator` controls what the final call returns.
 */
function createQueryMock(terminator: {
  single?: unknown;
  maybeSingle?: unknown;
  default?: unknown;
}) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.delete = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.is = vi.fn(self);
  chain.in = vi.fn(self);
  chain.order = vi.fn(self);
  chain.range = vi.fn(self);
  chain.single = vi.fn().mockResolvedValue(terminator.single);
  chain.maybeSingle = vi.fn().mockResolvedValue(terminator.maybeSingle);
  // For direct awaiting (no terminator)
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve(terminator.default ?? terminator.single ?? terminator.maybeSingle);
  return chain;
}

// ---------------------------------------------------------------------------
// createJobAction
// ---------------------------------------------------------------------------
describe("createJobAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await createJobAction(buildValidFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("認証情報が見つかりません");
    }
  });

  it("returns error when user role is contractor", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    const usersQuery = createQueryMock({
      single: { data: { role: "contractor" }, error: null },
    });
    mockFrom.mockReturnValue(usersQuery);

    const result = await createJobAction(buildValidFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("権限がありません");
    }
  });

  it("returns error when no active subscription", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(buildValidFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("サブスクリプション");
    }
  });

  it("returns validation error when title is empty", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { status: "active", plan_type: "individual" },
            error: null,
          },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(buildValidFormData({ title: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("タイトル");
    }
  });

  it("returns success when creating a draft job", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { status: "active", plan_type: "individual" },
            error: null,
          },
        });
      }
      if (table === "jobs") {
        return createQueryMock({
          single: { data: { id: "job-1" }, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(buildValidFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe("job-1");
    }
  });

  it("returns error for individual plan when open job limit reached", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    // Track from() calls to differentiate the open job count query
    let jobCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { status: "active", plan_type: "individual" },
            error: null,
          },
        });
      }
      if (table === "jobs") {
        jobCallCount++;
        if (jobCallCount === 1) {
          // checkOpenJobLimit - count query returns count: 1 (limit reached)
          const countChain: Record<string, unknown> = {};
          const selfFn = () => countChain;
          countChain.select = vi.fn(selfFn);
          countChain.eq = vi.fn(selfFn);
          countChain.is = vi.fn().mockResolvedValue({ count: 1, error: null });
          return countChain;
        }
        return createQueryMock({
          single: { data: { id: "job-1" }, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(
      buildValidFormData({ status: "open" })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("掲載上限");
    }
  });

  // --- delta validate (master-skills R3 AC-13 / R9 AC-3) ---

  it("rejects unknown trade_type label (not in master_trade_types)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { status: "active", plan_type: "individual" },
            error: null,
          },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const formData = buildValidFormData();
    formData.delete("tradeTypes");
    formData.append("tradeTypes", "存在しない職種");

    const result = await createJobAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("存在しない職種");
    }
  });

  it("rejects newly added deprecated trade_type label", async () => {
    mockedGetAllMasterRows.mockResolvedValueOnce([
      { label: "大工", deprecated_at: null },
      { label: "旧職種", deprecated_at: "2026-04-01T00:00:00.000Z" },
    ]);
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: { data: null, error: null },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { status: "active", plan_type: "individual" },
            error: null,
          },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const formData = buildValidFormData();
    formData.delete("tradeTypes");
    formData.append("tradeTypes", "旧職種");

    const result = await createJobAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("廃止された職種");
    }
  });

  it("allows corporate plan to create open jobs without limit", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
        });
      }
      if (table === "organization_members") {
        return createQueryMock({
          maybeSingle: {
            data: { organization_id: "org-1" },
            error: null,
          },
        });
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { status: "active", plan_type: "corporate" },
            error: null,
          },
        });
      }
      if (table === "jobs") {
        return createQueryMock({
          single: { data: { id: "job-1" }, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(
      buildValidFormData({ status: "open" })
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateJobAction
// ---------------------------------------------------------------------------
describe("updateJobAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when jobId is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const formData = buildValidFormData();
    const result = await updateJobAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("案件ID");
    }
  });

  it("rejects invalid status transition closed -> draft", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation(() =>
      createQueryMock({
        single: {
          data: {
            id: "job-1",
            owner_id: "user-1",
            organization_id: null,
            status: "closed",
          },
          error: null,
        },
      })
    );

    const formData = buildValidFormData({ status: "draft" });
    formData.set("jobId", "job-1");
    const result = await updateJobAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("現在のステータスでは実行できません");
    }
  });

  it("rejects invalid status transition closed -> open", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation(() =>
      createQueryMock({
        single: {
          data: {
            id: "job-1",
            owner_id: "user-1",
            organization_id: null,
            status: "closed",
          },
          error: null,
        },
      })
    );

    const formData = buildValidFormData({ status: "open" });
    formData.set("jobId", "job-1");
    const result = await updateJobAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("現在のステータスでは実行できません");
    }
  });

  it("allows draft -> open transition", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    let jobCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        jobCallCount++;
        if (jobCallCount === 1) {
          // existing job fetch
          return createQueryMock({
            single: {
              data: {
                id: "job-1",
                owner_id: "user-1",
                organization_id: null,
                status: "draft",
              },
              error: null,
            },
          });
        }
        if (jobCallCount === 2) {
          // checkOpenJobLimit count query
          const countChain: Record<string, unknown> = {};
          const selfFn = () => countChain;
          countChain.select = vi.fn(selfFn);
          countChain.eq = vi.fn(selfFn);
          countChain.is = vi.fn().mockResolvedValue({ count: 0, error: null });
          return countChain;
        }
        if (jobCallCount === 3) {
          // delta validate: previousLabels SELECT (master-skills Phase 4.3)
          return createQueryMock({
            single: { data: { trade_types: [] }, error: null },
          });
        }
        // update query
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "subscriptions") {
        return createQueryMock({
          maybeSingle: {
            data: { plan_type: "individual" },
            error: null,
          },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const formData = buildValidFormData({ status: "open" });
    formData.set("jobId", "job-1");
    const result = await updateJobAction(formData);
    expect(result.success).toBe(true);
  });

  // --- delta validate: 既存保有 deprecated は保持を許可 (R3 AC-13 / R9 AC-3) ---

  it("allows keeping an existing deprecated trade_type when previousLabels contains it", async () => {
    // この case では tradeTypes (newLabels) と previousLabels の両方に
    // 廃止済みの "旧職種" が含まれる → added は空 → validateLabelChanges は
    // master ルックアップを行わず valid: true を返す。save が通ること。
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    let jobCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        jobCallCount++;
        if (jobCallCount === 1) {
          // existing job fetch
          return createQueryMock({
            single: {
              data: {
                id: "job-1",
                owner_id: "user-1",
                organization_id: null,
                status: "open",
              },
              error: null,
            },
          });
        }
        if (jobCallCount === 2) {
          // delta validate: previousLabels SELECT — returns the deprecated label
          return createQueryMock({
            single: { data: { trade_types: ["旧職種"] }, error: null },
          });
        }
        // update query
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const formData = buildValidFormData({ status: "open" });
    formData.set("jobId", "job-1");
    formData.delete("tradeTypes");
    formData.append("tradeTypes", "旧職種");

    const result = await updateJobAction(formData);
    expect(result.success).toBe(true);
    // getAllMasterRows must NOT be called because added is empty (optimization)
    expect(mockedGetAllMasterRows).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteJobImageAction
// ---------------------------------------------------------------------------
describe("deleteJobImageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const formData = new FormData();
    formData.set("imageId", "img-1");
    formData.set("jobId", "job-1");
    const result = await deleteJobImageAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("認証情報が見つかりません");
    }
  });

  it("returns error when required params are missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const formData = new FormData();
    const result = await deleteJobImageAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("パラメータが不足");
    }
  });

  it("returns error when image is not found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockFrom.mockImplementation(() =>
      createQueryMock({
        single: { data: null, error: null },
      })
    );

    const formData = new FormData();
    formData.set("imageId", "img-1");
    formData.set("jobId", "job-1");
    const result = await deleteJobImageAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("画像が見つかりません");
    }
  });
});
