import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * withdrawAction（本人退会）のテスト。
 * admin spec Task 3.4 でカスケード本体は executeWithdrawal
 * （src/lib/withdrawal/execute.ts）に抽出された。ガード・カスケードの詳細は
 * execute-withdrawal.test.ts が担い、ここではラッパーの責務
 * （認証・バリデーション・survey 受け渡し・メール・signOut）を検証する。
 * executeWithdrawal はモックせず実体を通す（DB 書き込みは admin client 経由）。
 */

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminAuthUpdate = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
const mockStripeCancel = vi.fn().mockResolvedValue({});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    auth: {
      admin: {
        updateUserById: (...args: unknown[]) => mockAdminAuthUpdate(...args),
      },
    },
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    subscriptions: { cancel: (...args: unknown[]) => mockStripeCancel(...args) },
  }),
}));

import { withdrawAction } from "@/app/(authenticated)/profile/withdrawal/actions";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";

interface ChainConfig {
  count?: number;
  data?: unknown;
  thenable?: { data: unknown; error: unknown };
}

/** .from() の戻り値チェイン Mock（select の head 有無で then を切替） */
function makeChain(config: ChainConfig = {}) {
  const inserts: Array<Record<string, unknown>> = [];

  const defineThen = (resolver: () => unknown) => {
    Object.defineProperty(chain, "then", {
      configurable: true,
      value: (resolve: (v: unknown) => void) => resolve(resolver()),
    });
  };

  const chain: Record<string, unknown> = {
    select: vi.fn((_cols: string, opts?: { head?: boolean }) => {
      if (opts?.head) {
        defineThen(() => ({ count: config.count ?? 0, error: null }));
      } else if (config.thenable) {
        defineThen(() => ({
          data: config.thenable!.data,
          error: config.thenable!.error,
        }));
      }
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return chain;
    }),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: config.data ?? null, error: null }),
  };
  if (config.thenable) {
    defineThen(() => ({
      data: config.thenable!.data,
      error: config.thenable!.error,
    }));
  } else {
    defineThen(() => ({ data: null, error: null }));
  }
  return Object.assign(chain, { _inserts: inserts });
}

type Chain = ReturnType<typeof makeChain>;

/** admin client をテーブル名ルーティングで設定（テーブルごとに同一チェイン再利用） */
function setupAdminTables(configs: Record<string, ChainConfig>) {
  const chains = new Map<string, Chain>();
  mockAdminFrom.mockImplementation((table: string) => {
    if (!chains.has(table)) {
      chains.set(table, makeChain(configs[table] ?? {}));
    }
    return chains.get(table)!;
  });
  return chains;
}

/** 退会が成功する標準シナリオ（組織なし個人ユーザー） */
function setupHappyPath() {
  return setupAdminTables({
    applications: { count: 0, thenable: { data: [], error: null } },
    organization_members: { data: null },
    users: {
      data: {
        role: "contractor",
        email: "owner@test.local",
        last_name: "山田",
        first_name: "太郎",
      },
      thenable: { data: null, error: null },
    },
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  mockAdminAuthUpdate.mockReset().mockResolvedValue({ data: null, error: null });
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockSendEmail.mockReset().mockResolvedValue({ success: true });
  mockStripeCancel.mockReset().mockResolvedValue({});

  mockGetUser.mockResolvedValue({
    data: { user: { id: OWNER_ID, email: "owner@test.local" } },
    error: null,
  });
});

function buildFormData(): FormData {
  const fd = new FormData();
  // reason は WITHDRAWAL_REASONS の code（フォームは code を submit する）
  fd.set("reason", "other");
  fd.set("details", "テスト");
  fd.set("confirmed", "on");
  return fd;
}

describe("withdrawAction: 認証・バリデーション", () => {
  it("未認証ユーザーはエラーを返す", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await withdrawAction(
      { success: false, error: "" },
      buildFormData(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("認証されていません");
    }
  });

  it("確認チェックなしはバリデーションエラーを返す", async () => {
    const fd = new FormData();
    fd.set("reason", "other");
    fd.set("details", "テスト");
    // confirmed なし

    const result = await withdrawAction({ success: false, error: "" }, fd);

    expect(result.success).toBe(false);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });
});

describe("withdrawAction: 成功フロー（executeWithdrawal 実体経由）", () => {
  it("退会成功で signOut と退会完了メールが実行される", async () => {
    setupHappyPath();

    const result = await withdrawAction(
      { success: false, error: "" },
      buildFormData(),
    );

    expect(result.success).toBe(true);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@test.local" }),
    );
    // 対象本人の auth ban（executeWithdrawal 内）
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(OWNER_ID, {
      ban_duration: "876600h",
    });
  });

  it("退会理由 survey が recordSurvey 経由で保存される", async () => {
    const chains = setupHappyPath();

    const fd = new FormData();
    fd.set("reason", "price_high");
    fd.set("details", "高い");
    fd.set("confirmed", "on");

    const result = await withdrawAction({ success: false, error: "" }, fd);

    expect(result.success).toBe(true);
    const surveyChain = chains.get("withdrawal_surveys");
    expect(surveyChain).toBeDefined();
    expect(surveyChain!._inserts[0]).toMatchObject({
      user_id: OWNER_ID,
      reason_code: "price_high",
      reason_label: "料金が高い",
      details: "高い",
      role: "contractor",
    });
  });
});

describe("withdrawAction: ガード拒否時", () => {
  it("進行中応募があれば退会できず、signOut もメールも実行されない", async () => {
    setupAdminTables({
      applications: { count: 1, thenable: { data: [], error: null } },
    });

    const result = await withdrawAction(
      { success: false, error: "" },
      buildFormData(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("応募中または進行中の案件があるため退会できません");
    }
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("法人の担当者（org_role=staff）は退会できない", async () => {
    setupAdminTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: {
        data: { org_role: "staff", organization_id: "org-1" },
      },
    });

    const result = await withdrawAction(
      { success: false, error: "" },
      buildFormData(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("管理責任者");
    }
  });
});
