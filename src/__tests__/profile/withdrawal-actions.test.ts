import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminAuthUpdate = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockSendEmail = vi.fn().mockResolvedValue({ success: true });

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

import { withdrawAction } from "@/app/(authenticated)/profile/withdrawal/actions";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "55555555-5555-5555-5555-555555555555";

interface ChainConfig {
  count?: number;
  data?: unknown;
  thenable?: { data: unknown; error: unknown };
}

/**
 * .from() の戻り値となるチェイン Mock。
 * 末端 .maybeSingle() / `await` (thenable) / `{ count, head: true }` の戻り値を
 * 引数経由で差し替えできるようにし、各 spy を保持して呼び出しを観察可能にする。
 */
function makeChain(config: ChainConfig = {}) {
  const eqCalls: Array<[string, unknown]> = [];
  const inCalls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {
    select: vi.fn(function (this: unknown, _cols: string, _opts?: unknown) {
      // SELECT with { count: 'exact', head: true } resolves directly to a Promise-like
      if (
        typeof _opts === "object" &&
        _opts !== null &&
        (_opts as { head?: boolean }).head
      ) {
        // Make this chain a thenable that returns count
        Object.defineProperty(chain, "then", {
          configurable: true,
          value: (resolve: (v: unknown) => void) =>
            resolve({ count: config.count ?? 0, error: null }),
        });
      }
      return chain;
    }),
    eq: vi.fn(function (this: unknown, col: string, val: unknown) {
      eqCalls.push([col, val]);
      return chain;
    }),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn(function (this: unknown, col: string, vals: unknown[]) {
      inCalls.push([col, vals]);
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: config.data ?? null, error: null }),
  };
  if (config.thenable) {
    Object.defineProperty(chain, "then", {
      configurable: true,
      value: (resolve: (v: unknown) => void) =>
        resolve({
          data: config.thenable!.data,
          error: config.thenable!.error,
        }),
    });
  }
  return Object.assign(chain, { _eqCalls: eqCalls, _inCalls: inCalls });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockAdminFrom.mockReset();
  mockAdminAuthUpdate.mockReset().mockResolvedValue({ error: null });
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockSendEmail.mockReset().mockResolvedValue({ success: true });

  mockGetUser.mockResolvedValue({
    data: { user: { id: OWNER_ID, email: "owner@test.local" } },
    error: null,
  });
});

function buildFormData(): FormData {
  const fd = new FormData();
  fd.set("reason", "その他");
  fd.set("details", "テスト");
  fd.set("confirmed", "on");
  return fd;
}

describe("withdrawAction の発注中案件チェックスコープ (REQ-PF-006)", () => {
  it("法人 Owner: jobs.organization_id でチェックされる（広義）", async () => {
    // Check 1: applicant 側 active applications → 0 件
    const check1Chain = makeChain({ count: 0 });
    // Check Org membership: 法人 Owner
    const orgChain = makeChain({
      data: { org_role: "owner", organization_id: ORG_ID },
    });
    // Check 2: organization_id 経由でクエリされる
    const ownedJobChain = makeChain({ thenable: { data: [], error: null } });

    mockFrom
      .mockReturnValueOnce(check1Chain) // applications (Check 1)
      .mockReturnValueOnce(orgChain) // organization_members
      .mockReturnValueOnce(ownedJobChain); // applications (Check 2)
    // 後続の cascade 用 from は適当に空チェイン
    mockFrom.mockReturnValue(makeChain({ thenable: { data: null, error: null } }));
    mockAdminFrom.mockReturnValue(
      makeChain({ thenable: { data: null, error: null }, data: null }),
    );

    await withdrawAction({ success: false, error: "" }, buildFormData());

    // Check 2 のチェイン上で `.eq("jobs.organization_id", ORG_ID)` が呼ばれている
    const orgFilterCalled = ownedJobChain._eqCalls.some(
      ([col, val]) => col === "jobs.organization_id" && val === ORG_ID,
    );
    const ownerFilterCalled = ownedJobChain._eqCalls.some(
      ([col, val]) => col === "jobs.owner_id" && val === OWNER_ID,
    );
    expect(orgFilterCalled).toBe(true);
    expect(ownerFilterCalled).toBe(false);
  });

  it("組織なし（個人発注者プラン Owner 等）: jobs.owner_id でチェックされる（狭義）", async () => {
    const check1Chain = makeChain({ count: 0 });
    // 組織メンバーシップ無し → owner_id 経由
    const orgChain = makeChain({ data: null });
    const ownedJobChain = makeChain({ thenable: { data: [], error: null } });

    mockFrom
      .mockReturnValueOnce(check1Chain)
      .mockReturnValueOnce(orgChain)
      .mockReturnValueOnce(ownedJobChain);
    mockFrom.mockReturnValue(makeChain({ thenable: { data: null, error: null } }));
    mockAdminFrom.mockReturnValue(
      makeChain({ thenable: { data: null, error: null }, data: null }),
    );

    await withdrawAction({ success: false, error: "" }, buildFormData());

    const ownerFilterCalled = ownedJobChain._eqCalls.some(
      ([col, val]) => col === "jobs.owner_id" && val === OWNER_ID,
    );
    const orgFilterCalled = ownedJobChain._eqCalls.some(
      ([col]) => col === "jobs.organization_id",
    );
    expect(ownerFilterCalled).toBe(true);
    expect(orgFilterCalled).toBe(false);
  });

  it("法人 Owner: 組織内の進行中案件が見つかったら退会不可エラー", async () => {
    const check1Chain = makeChain({ count: 0 });
    const orgChain = makeChain({
      data: { org_role: "owner", organization_id: ORG_ID },
    });
    // Check 2 で 1 件返す → 退会不可
    const ownedJobChain = makeChain({
      thenable: {
        data: [
          { id: "app-1", jobs: { owner_id: "other-staff", organization_id: ORG_ID } },
        ],
        error: null,
      },
    });
    mockFrom
      .mockReturnValueOnce(check1Chain)
      .mockReturnValueOnce(orgChain)
      .mockReturnValueOnce(ownedJobChain);

    const result = await withdrawAction(
      { success: false, error: "" },
      buildFormData(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("受注者が作業中の案件があるため退会できません");
    }
  });

  it("Owner 以外（Staff/Admin）は退会不可エラー", async () => {
    const check1Chain = makeChain({ count: 0 });
    const orgChain = makeChain({
      data: { org_role: "staff", organization_id: ORG_ID },
    });
    mockFrom.mockReturnValueOnce(check1Chain).mockReturnValueOnce(orgChain);

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
