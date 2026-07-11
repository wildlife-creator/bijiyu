import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup - vi.mock factories cannot reference outer variables
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockRpc = vi.fn();
const mockGetActiveOrgContext = vi.fn();
// Admin client の from() は Staff/Admin (org_role) が実効サブスクを引くための
// resolveEffectiveSubscription 経路で使われる。テストごとにモック実装を差し替える。
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

// proxy-account-multi-org-support: createJobAction は organization_members を
// 直接読まず getActiveOrganizationContext 経由に切り替わった。
vi.mock("@/lib/organization/active-org-context", () => ({
  getActiveOrganizationContext: (...args: unknown[]) =>
    mockGetActiveOrgContext(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
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
    // validateLabelChanges は Or-Throw アクセサを使う（成功時は同じ結果）。
    getAllMasterRowsOrThrow: vi.fn().mockImplementation((kind: string) => {
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
import { getAllMasterRowsOrThrow } from "@/lib/master/fetch";

const mockedGetAllMasterRowsOrThrow = vi.mocked(getAllMasterRowsOrThrow);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildValidFormData(overrides: Record<string, string> = {}): FormData {
  const defaults: Record<string, string> = {
    title: "テスト案件",
    description: "テスト詳細説明です",
    rewardLower: "18000",
    rewardUpper: "22000",
    // areas は AreaRow[] を JSON シリアライズ (Server Action 側で JSON.parse)
    areas: JSON.stringify([
      { prefecture: "東京都", whole: true, municipalities: [] },
    ]),
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
    ownerMessage: "ご応募お待ちしております。",
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
    // replace_job_areas / replace_user_areas 等の RPC はデフォルト成功
    mockRpc.mockResolvedValue({ data: null, error: null });
    // 既定: 個人プラン (active=null)。法人プランの test で上書きする。
    mockGetActiveOrgContext.mockResolvedValue({ active: null, all: [] });
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

  it("タイトルのみの下書き保存（数値項目が空欄）でも成功する", async () => {
    // 確認1 回帰: 旧実装は Number("")=0 → jobDraftSchema の positive() に弾かれて
    // 「タイトルのみ下書き」が保存できなかった。numOrNaN で NaN 化し保存時に null 化する。
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
        return createQueryMock({ maybeSingle: { data: null, error: null } });
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

    const result = await createJobAction(
      buildValidFormData({
        description: "",
        rewardLower: "",
        rewardUpper: "",
        headcount: "",
        workStartDate: "",
        workEndDate: "",
        recruitStartDate: "",
        recruitEndDate: "",
        ownerMessage: "",
        areas: JSON.stringify([]),
        status: "draft",
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe("job-1");
    }
  });

  // -------------------------------------------------------------------------
  // direct-upload 化した画像パス (imagePaths) の検証
  // -------------------------------------------------------------------------
  function mockHappyPathTables(jobImagesTerminator: {
    default: unknown;
  }): Record<string, unknown>[] {
    const jobImageInserts: Record<string, unknown>[] = [];
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
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
      if (table === "job_images") {
        const chain = createQueryMock(jobImagesTerminator);
        const originalInsert = chain.insert as ReturnType<typeof vi.fn>;
        originalInsert.mockImplementation((rows: Record<string, unknown>[]) => {
          jobImageInserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return chain;
        });
        return chain;
      }
      return createQueryMock({ single: { data: null, error: null } });
    });
    mockStorageFrom.mockReturnValue({
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://cdn.example.com/job-attachments/${path}` },
      }),
    });
    return jobImageInserts;
  }

  it("本人フォルダ外の imagePaths は『画像データが不正』で拒否する", async () => {
    mockHappyPathTables({ default: { error: null } });
    const fd = buildValidFormData();
    fd.append("imagePaths", "other-user/evil.png");

    const result = await createJobAction(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("画像データが不正");
  });

  it("imagePaths を publicUrl に解決して job_images に登録する", async () => {
    const inserts = mockHappyPathTables({ default: { error: null } });
    const fd = buildValidFormData();
    fd.append("imagePaths", "user-1/aaa.png");
    fd.append("imagePaths", "user-1/bbb.jpg");

    const result = await createJobAction(fd);
    expect(result.success).toBe(true);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({
      job_id: "job-1",
      image_url: "https://cdn.example.com/job-attachments/user-1/aaa.png",
      sort_order: 0,
    });
    expect(inserts[1]).toMatchObject({ sort_order: 1 });
  });

  it("job_images の insert 失敗は黙殺せずエラーを返す", async () => {
    mockHappyPathTables({ default: { error: { message: "rls block" } } });
    const fd = buildValidFormData();
    fd.append("imagePaths", "user-1/aaa.png");

    const result = await createJobAction(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("画像の保存に失敗");
  });

  it("11枚以上の imagePaths は上限エラーを返す（旧実装は黙って成功していた）", async () => {
    mockHappyPathTables({ default: { error: null } });
    const fd = buildValidFormData();
    for (let i = 0; i < 11; i++) {
      fd.append("imagePaths", `user-1/img-${i}.png`);
    }

    const result = await createJobAction(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("最大10枚");
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
    mockedGetAllMasterRowsOrThrow.mockResolvedValueOnce([
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
    mockGetActiveOrgContext.mockResolvedValue({
      active: {
        organizationId: "org-1",
        orgRole: "owner",
        isProxyAccount: false,
        orgOwnerId: "user-1",
        isCorporate: true,
      },
      all: [],
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "client" }, error: null },
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

  // -------------------------------------------------------------------------
  // Staff / Admin (org_role) の実効サブスク解決（resolveEffectiveSubscription）
  //
  // 法人プランの Staff は自分の subscription を持たない設計のため、
  // Owner の subscription を admin client 経由で引く必要がある
  // （CLAUDE.md「Staff ユーザーの subscription 参照」）。
  // -------------------------------------------------------------------------

  const STAFF_ID = "33333333-3333-3333-3333-333333333333";
  const OWNER_ID = "22222222-2222-2222-2222-222222222222";
  const ORG_ID = "55555555-5555-5555-5555-555555555555";

  function mockStaffContext(orgRole: "staff" | "admin") {
    mockGetActiveOrgContext.mockResolvedValue({
      active: {
        organizationId: ORG_ID,
        orgRole,
        isProxyAccount: orgRole === "staff",
        orgOwnerId: OWNER_ID,
        isCorporate: true,
      },
      all: [
        {
          organizationId: ORG_ID,
          orgRole,
          isProxyAccount: orgRole === "staff",
          displayName: "テスト法人",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
  }

  it("普通の担当者（org_role=staff）は Owner のサブスクに相乗りして下書き作成成功", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: STAFF_ID } } });
    mockStaffContext("staff");

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "staff" }, error: null },
        });
      }
      if (table === "jobs") {
        return createQueryMock({
          single: { data: { id: "job-staff-1" }, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const adminSubEqCalls: Array<{ column: string; value: unknown }> = [];
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn((column: string, value: unknown) => {
          adminSubEqCalls.push({ column, value });
          return chain;
        });
        chain.in = vi.fn(self);
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { status: "active", plan_type: "corporate" },
          error: null,
        });
        return chain;
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(buildValidFormData());

    expect(result.success).toBe(true);
    // 実効サブスクは admin client 経由で Owner の user_id を key に引かれる
    expect(adminSubEqCalls).toEqual([
      { column: "user_id", value: OWNER_ID },
    ]);
    if (result.success) {
      expect(result.data?.id).toBe("job-staff-1");
    }
  });

  it("強い担当者（org_role=admin）も Owner のサブスクに相乗りして下書き作成成功", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "ee111111-1111-1111-1111-111111111111" } },
    });
    mockStaffContext("admin");

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "staff" }, error: null },
        });
      }
      if (table === "jobs") {
        return createQueryMock({
          single: { data: { id: "job-admin-1" }, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const adminSubEqCalls: Array<{ column: string; value: unknown }> = [];
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn((column: string, value: unknown) => {
          adminSubEqCalls.push({ column, value });
          return chain;
        });
        chain.in = vi.fn(self);
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { status: "active", plan_type: "corporate_premium" },
          error: null,
        });
        return chain;
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(buildValidFormData());

    expect(result.success).toBe(true);
    expect(adminSubEqCalls).toEqual([
      { column: "user_id", value: OWNER_ID },
    ]);
  });

  it("担当者だが Owner のサブスクが解約済みの場合は『有効なサブスクリプションがありません』", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: STAFF_ID } } });
    mockStaffContext("staff");

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return createQueryMock({
          single: { data: { role: "staff" }, error: null },
        });
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn(self);
        chain.in = vi.fn(self);
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: null,
          error: null,
        });
        return chain;
      }
      return createQueryMock({ single: { data: null, error: null } });
    });

    const result = await createJobAction(buildValidFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("サブスクリプション");
    }
  });
});

// ---------------------------------------------------------------------------
// updateJobAction
// ---------------------------------------------------------------------------
describe("updateJobAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // replace_job_areas / replace_user_areas 等の RPC はデフォルト成功
    mockRpc.mockResolvedValue({ data: null, error: null });
    // 既定: 個人プラン (active=null)。法人プランの test で上書きする。
    mockGetActiveOrgContext.mockResolvedValue({ active: null, all: [] });
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
    // master lookup must NOT run because added is empty (optimization)
    expect(mockedGetAllMasterRowsOrThrow).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteJobImageAction
// ---------------------------------------------------------------------------
describe("deleteJobImageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // replace_job_areas / replace_user_areas 等の RPC はデフォルト成功
    mockRpc.mockResolvedValue({ data: null, error: null });
    // 既定: 個人プラン (active=null)。法人プランの test で上書きする。
    mockGetActiveOrgContext.mockResolvedValue({ active: null, all: [] });
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
