import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  cancelApplicationAction,
  submitContractorReportAction,
  acceptApplicationAction,
  rejectApplicationAction,
  submitClientReportAction,
} from "@/app/(authenticated)/applications/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const APP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const JOB_OWNER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function mockAuth(userId: string | null) {
  if (userId) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  } else {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });
  }
}

function createQueryMock(terminator: { single?: unknown; data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(
      terminator.single ?? { data: terminator.data ?? null, error: terminator.error ?? null },
    ),
    maybeSingle: vi.fn().mockResolvedValue(
      { data: terminator.data ?? null, error: terminator.error ?? null },
    ),
    then: undefined,
  };

  // If no single/maybeSingle call, resolve the chain itself
  if (terminator.data !== undefined || terminator.error !== undefined) {
    Object.defineProperty(chain, "then", {
      value: (resolve: (v: unknown) => void) =>
        resolve({ data: terminator.data, error: terminator.error }),
    });
  }

  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// cancelApplicationAction
// ---------------------------------------------------------------------------
describe("cancelApplicationAction", () => {
  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await cancelApplicationAction(APP_ID);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "認証が必要です");
  });

  it("自分の応募でなければエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: "other-user",
            status: "accepted",
            first_work_date: "2099-12-31",
          },
          error: null,
        },
      }),
    );

    const result = await cancelApplicationAction(APP_ID);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "この応募をキャンセルする権限がありません");
  });

  it("accepted 以外のステータスはエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: USER_ID,
            status: "applied",
            first_work_date: "2099-12-31",
          },
          error: null,
        },
      }),
    );

    const result = await cancelApplicationAction(APP_ID);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "発注済みの応募のみキャンセルできます");
  });

  it("5日前を過ぎている場合はエラーを返す", async () => {
    mockAuth(USER_ID);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: USER_ID,
            status: "accepted",
            first_work_date: yesterday.toISOString().split("T")[0],
          },
          error: null,
        },
      }),
    );

    const result = await cancelApplicationAction(APP_ID);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
    if (!result.success) {
      expect(result.error).toContain("5日前を過ぎた");
    }
  });

  it("条件を満たす場合はキャンセルが成功する", async () => {
    mockAuth(USER_ID);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    // First call: select for fetch (via mockFrom = supabase client)
    const selectMock = createQueryMock({
      single: {
        data: {
          id: APP_ID,
          applicant_id: USER_ID,
          status: "accepted",
          first_work_date: futureDate.toISOString().split("T")[0],
        },
        error: null,
      },
    });

    // admin client update mock
    const updateMock = createQueryMock({ data: null, error: null });

    mockFrom.mockReturnValue(selectMock);
    mockAdminFrom.mockReturnValue(updateMock);

    const result = await cancelApplicationAction(APP_ID);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// submitContractorReportAction
// ---------------------------------------------------------------------------
describe("submitContractorReportAction", () => {
  function buildFormData(overrides: Record<string, string> = {}): FormData {
    const defaults: Record<string, string> = {
      applicationId: APP_ID,
      operatingStatus: "問題なく稼働完了",
      ratingAgain: "good",
    };
    const fd = new FormData();
    const merged = { ...defaults, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      fd.set(k, v);
    }
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await submitContractorReportAction(buildFormData());
    expect(result.success).toBe(false);
  });

  it("Zodバリデーションエラーを返す（operatingStatus が不正）", async () => {
    mockAuth(USER_ID);
    const result = await submitContractorReportAction(
      buildFormData({ operatingStatus: "invalid" }),
    );
    expect(result.success).toBe(false);
  });

  it("他人の応募に対してはエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: "other-user",
            status: "accepted",
            jobs: { id: "j1", title: "Job", owner_id: JOB_OWNER_ID, organization_id: null },
            applicant: null,
          },
          error: null,
        },
      }),
    );

    const result = await submitContractorReportAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "この応募に対する権限がありません");
  });

  it("accepted 以外のステータスではエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: USER_ID,
            status: "applied",
            jobs: { id: "j1", title: "Job", owner_id: JOB_OWNER_ID, organization_id: null },
            applicant: null,
          },
          error: null,
        },
      }),
    );

    const result = await submitContractorReportAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "発注済みの応募のみ完了報告できます");
  });
});

// ---------------------------------------------------------------------------
// acceptApplicationAction
// ---------------------------------------------------------------------------
describe("acceptApplicationAction", () => {
  function buildFormData(overrides: Record<string, string> = {}): FormData {
    const defaults: Record<string, string> = {
      applicationId: APP_ID,
      workLocation: "東京都渋谷区1-1-1",
      firstWorkDate: "2026-05-01",
    };
    const fd = new FormData();
    const merged = { ...defaults, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      fd.set(k, v);
    }
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await acceptApplicationAction(buildFormData());
    expect(result.success).toBe(false);
  });

  it("Zodバリデーションエラーを返す（firstWorkDate が空）", async () => {
    mockAuth(USER_ID);
    const result = await acceptApplicationAction(
      buildFormData({ firstWorkDate: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("案件オーナー以外はエラーを返す", async () => {
    mockAuth(USER_ID);

    // applications.select (fetch with details)
    const fetchMock = createQueryMock({
      single: {
        data: {
          id: APP_ID,
          applicant_id: "applicant-1",
          status: "applied",
          jobs: { id: "j1", title: "Job", owner_id: "other-owner", organization_id: null },
          applicant: { id: "applicant-1", email: "a@test.com", last_name: "Test", first_name: "User", deleted_at: null },
        },
        error: null,
      },
    });

    mockFrom.mockReturnValue(fetchMock);

    const result = await acceptApplicationAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "この応募に対する権限がありません");
  });

  it("applied 以外のステータスではエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: "applicant-1",
            status: "accepted",
            jobs: { id: "j1", title: "Job", owner_id: USER_ID, organization_id: null },
            applicant: { id: "applicant-1", email: "a@test.com", last_name: "Test", first_name: "User", deleted_at: null },
          },
          error: null,
        },
      }),
    );

    const result = await acceptApplicationAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "応募中の案件のみ発注できます");
  });
});

// ---------------------------------------------------------------------------
// rejectApplicationAction
// ---------------------------------------------------------------------------
describe("rejectApplicationAction", () => {
  function buildFormData(overrides: Record<string, string> = {}): FormData {
    const defaults: Record<string, string> = {
      applicationId: APP_ID,
    };
    const fd = new FormData();
    const merged = { ...defaults, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      fd.set(k, v);
    }
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await rejectApplicationAction(buildFormData());
    expect(result.success).toBe(false);
  });

  it("案件オーナー以外はエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: "applicant-1",
            status: "applied",
            jobs: { id: "j1", title: "Job", owner_id: "other-owner", organization_id: null },
            applicant: null,
          },
          error: null,
        },
      }),
    );

    const result = await rejectApplicationAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "この応募に対する権限がありません");
  });

  it("applied 以外のステータスではエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: "applicant-1",
            status: "rejected",
            jobs: { id: "j1", title: "Job", owner_id: USER_ID, organization_id: null },
            applicant: null,
          },
          error: null,
        },
      }),
    );

    const result = await rejectApplicationAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "応募中の案件のみお断りできます");
  });
});

// ---------------------------------------------------------------------------
// submitClientReportAction
// ---------------------------------------------------------------------------
describe("submitClientReportAction", () => {
  function buildFormData(overrides: Record<string, string> = {}): FormData {
    const defaults: Record<string, string> = {
      applicationId: APP_ID,
      operatingStatus: "問題なく稼働完了",
      ratingAgain: "good",
      ratingFollowsInstructions: "good",
      ratingPunctual: "good",
      ratingSpeed: "good",
      ratingQuality: "good",
      ratingHasTools: "good",
    };
    const fd = new FormData();
    const merged = { ...defaults, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      fd.set(k, v);
    }
    return fd;
  }

  it("未認証ユーザーはエラーを返す", async () => {
    mockAuth(null);
    const result = await submitClientReportAction(buildFormData());
    expect(result.success).toBe(false);
  });

  it("Zodバリデーションエラーを返す（評価項目が不足）", async () => {
    mockAuth(USER_ID);
    const fd = new FormData();
    fd.set("applicationId", APP_ID);
    fd.set("operatingStatus", "問題なく稼働完了");
    fd.set("ratingAgain", "good");
    // Missing other 5 rating fields
    const result = await submitClientReportAction(fd);
    expect(result.success).toBe(false);
  });

  it("accepted 以外のステータスではエラーを返す", async () => {
    mockAuth(USER_ID);
    mockFrom.mockReturnValue(
      createQueryMock({
        single: {
          data: {
            id: APP_ID,
            applicant_id: "applicant-1",
            status: "completed",
            jobs: { id: "j1", title: "Job", owner_id: USER_ID, organization_id: null },
            applicant: null,
          },
          error: null,
        },
      }),
    );

    const result = await submitClientReportAction(buildFormData());
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error", "発注済みの応募のみ完了報告できます");
  });
});
