import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * executeWithdrawal（src/lib/withdrawal/execute.ts）のテスト。
 * C案カスケード退会の共有関数（本人退会 withdrawAction / admin 削除の両方から呼ばれる）。
 * - DB 書き込みはすべて admin client（service_role）
 * - Stripe 解約は正しい id で呼ばれ、失敗しても削除をブロックしない
 * - カスケードで cancelled にする応募に cancelledBy を記録する
 */

const mockAdminFrom = vi.fn();
const mockAdminAuthUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: (...args: unknown[]) => mockAdminAuthUpdate(...args),
      },
    },
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

// Task 9: applyDeletedSuffix の呼び出しを直接アサートするため module mock
const { applyDeletedSuffixMock } = vi.hoisted(() => ({
  applyDeletedSuffixMock: vi.fn(),
}));
vi.mock("@/lib/email-recycle/apply-deleted-suffix", () => ({
  applyDeletedSuffix: applyDeletedSuffixMock,
}));

const mockStripeCancel = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    subscriptions: { cancel: (...args: unknown[]) => mockStripeCancel(...args) },
  }),
}));

// §8.5 / §8.5.5 cascade メール送信 (fire-and-forget Promise.all) を観察するため
// sendEmail を vi.hoisted で巻き上げて mock 化する。
const { sendEmailMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendEmailMock: vi.fn(async (_args: unknown) => ({ success: true as const })),
}));
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: sendEmailMock,
}));

import { executeWithdrawal } from "@/lib/withdrawal/execute";

const TARGET_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "55555555-5555-5555-5555-555555555555";

interface ChainConfig {
  count?: number;
  data?: unknown;
  thenable?: { data: unknown; error: unknown };
}

/** .from() の戻り値チェイン Mock（呼び出し記録付き・select の head 有無で then を切替） */
function makeChain(config: ChainConfig = {}) {
  const eqCalls: Array<[string, unknown]> = [];
  const inCalls: Array<[string, unknown[]]> = [];
  const updates: Array<Record<string, unknown>> = [];
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
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn((col: string, vals: unknown[]) => {
      inCalls.push([col, vals]);
      return chain;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return chain;
    }),
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
  return Object.assign(chain, {
    _eqCalls: eqCalls,
    _inCalls: inCalls,
    _updates: updates,
    _inserts: inserts,
  });
}

type Chain = ReturnType<typeof makeChain>;

/** テーブル名 → チェイン（テーブルごとに同一インスタンスを再利用して記録を蓄積） */
function setupTables(configs: Record<string, ChainConfig>) {
  const chains = new Map<string, Chain>();
  mockAdminFrom.mockImplementation((table: string) => {
    if (!chains.has(table)) {
      chains.set(table, makeChain(configs[table] ?? {}));
    }
    return chains.get(table)!;
  });
  return chains;
}

beforeEach(() => {
  mockAdminFrom.mockReset();
  mockAdminAuthUpdate.mockReset().mockResolvedValue({ data: null, error: null });
  mockStripeCancel.mockReset().mockResolvedValue({});
  applyDeletedSuffixMock.mockReset().mockResolvedValue({
    kind: "applied",
    recycledEmail: "stub",
  });
  sendEmailMock.mockReset().mockResolvedValue({ success: true as const });
});

describe("executeWithdrawal: 退会前ガード", () => {
  it("応募中・進行中の応募があれば拒否する", async () => {
    setupTables({
      applications: { count: 2, thenable: { data: [], error: null } },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "admin",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("応募中または進行中の案件があるため退会できません");
    }
    // ガード拒否時はカスケードに入らない（ban されない）
    expect(mockAdminAuthUpdate).not.toHaveBeenCalled();
  });

  it("組織の Owner 以外（staff）は拒否する", async () => {
    setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: {
        data: { org_role: "staff", organization_id: ORG_ID },
      },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("管理責任者");
    }
  });

  it("受注者が作業中の案件があれば拒否する", async () => {
    setupTables({
      applications: {
        count: 0,
        thenable: {
          data: [{ id: "app-1", jobs: { owner_id: TARGET_ID } }],
          error: null,
        },
      },
      organization_members: { data: null },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "admin",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("受注者が作業中の案件があるため退会できません");
    }
  });

  it("法人 Owner は jobs.organization_id でチェックされる（広義）", async () => {
    const chains = setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: {
        data: { org_role: "owner", organization_id: ORG_ID },
        thenable: { data: [], error: null },
      },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    const appChain = chains.get("applications")!;
    expect(
      appChain._eqCalls.some(
        ([col, val]) => col === "jobs.organization_id" && val === ORG_ID,
      ),
    ).toBe(true);
    expect(
      appChain._eqCalls.some(([col]) => col === "jobs.owner_id"),
    ).toBe(false);
  });

  it("組織なしユーザーは jobs.owner_id でチェックされる（狭義）", async () => {
    const chains = setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: { data: null },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    const appChain = chains.get("applications")!;
    expect(
      appChain._eqCalls.some(
        ([col, val]) => col === "jobs.owner_id" && val === TARGET_ID,
      ),
    ).toBe(true);
  });
});

describe("executeWithdrawal: カスケード処理", () => {
  function setupHappyPath(extra: Record<string, ChainConfig> = {}) {
    return setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: { data: null },
      users: {
        data: { role: "contractor" },
        thenable: { data: null, error: null },
      },
      subscriptions: {
        thenable: {
          data: [{ plan_type: "individual", stripe_subscription_id: "sub_123" }],
          error: null,
        },
      },
      option_subscriptions: {
        thenable: {
          data: [
            { stripe_subscription_id: "sub_opt_1" },
            { stripe_subscription_id: null }, // one_time オプションは解約対象外
          ],
          error: null,
        },
      },
      ...extra,
    });
  }

  it("対象ユーザーをソフトデリートし auth ban する", async () => {
    const chains = setupHappyPath();

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    const usersChain = chains.get("users")!;
    expect(
      usersChain._updates.some((u) => typeof u.deleted_at === "string"),
    ).toBe(true);
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(TARGET_ID, {
      ban_duration: "876600h",
    });
  });

  it("カスケードで cancelled にする応募に cancelledBy を記録する（admin 削除）", async () => {
    const chains = setupHappyPath();

    await executeWithdrawal({ targetUserId: TARGET_ID, cancelledBy: "admin" });

    const appChain = chains.get("applications")!;
    expect(
      appChain._updates.some(
        (u) => u.status === "cancelled" && u.cancelled_by === "admin",
      ),
    ).toBe(true);
  });

  it("本人退会では cancelled_by=contractor を記録する", async () => {
    const chains = setupHappyPath();

    await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    const appChain = chains.get("applications")!;
    expect(
      appChain._updates.some(
        (u) => u.status === "cancelled" && u.cancelled_by === "contractor",
      ),
    ).toBe(true);
  });

  it("Stripe 解約が正しい id で呼ばれる（subscription + サブスク型オプションのみ）", async () => {
    setupHappyPath();

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    expect(mockStripeCancel).toHaveBeenCalledTimes(2);
    expect(mockStripeCancel).toHaveBeenCalledWith("sub_123");
    expect(mockStripeCancel).toHaveBeenCalledWith("sub_opt_1");
  });

  it("Stripe 解約が失敗しても削除は完了する（非ブロッキング）", async () => {
    const chains = setupHappyPath();
    mockStripeCancel.mockRejectedValue(new Error("stripe down"));

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    const usersChain = chains.get("users")!;
    expect(
      usersChain._updates.some((u) => typeof u.deleted_at === "string"),
    ).toBe(true);
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(TARGET_ID, {
      ban_duration: "876600h",
    });
  });

  it("法人 Owner の退会で配下メンバーを連動凍結し org をソフトデリートする", async () => {
    const MEMBER_ID = "22222222-2222-2222-2222-222222222222";
    const chains = setupHappyPath({
      organization_members: {
        data: { org_role: "owner", organization_id: ORG_ID },
        thenable: { data: [{ user_id: MEMBER_ID }], error: null },
      },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    // 配下メンバーの users.deleted_at 連動セット（.in("id", [MEMBER_ID])）
    const usersChain = chains.get("users")!;
    expect(
      usersChain._inCalls.some(
        ([col, vals]) => col === "id" && (vals as string[]).includes(MEMBER_ID),
      ),
    ).toBe(true);
    // 配下メンバーも ban される（対象本人 + メンバー）
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(MEMBER_ID, {
      ban_duration: "876600h",
    });
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(TARGET_ID, {
      ban_duration: "876600h",
    });
    // organizations ソフトデリート
    const orgChain = chains.get("organizations")!;
    expect(
      orgChain._updates.some((u) => typeof u.deleted_at === "string"),
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Task 9: applyDeletedSuffix 統合
  // -------------------------------------------------------------------------
  it("Task 9: 本人退会 (cancelledBy=contractor) → 対象本人で applyDeletedSuffix が呼ばれる (actorId = 本人)", async () => {
    setupHappyPath();

    await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(1);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_ID,
      { path: "self_withdrawal", actorId: TARGET_ID, organizationId: null },
    );
  });

  it("Task 9 + §8 prereq: admin 削除 (cancelledBy=admin) → applyDeletedSuffix の path は admin_force_delete + actorId は null", async () => {
    setupHappyPath();

    await executeWithdrawal({ targetUserId: TARGET_ID, cancelledBy: "admin" });

    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(1);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_ID,
      { path: "admin_force_delete", actorId: null, organizationId: null },
    );
  });

  it("Task 9: Owner 退会カスケードで配下メンバー全員に applyDeletedSuffix が呼ばれる (actor = Owner)", async () => {
    const MEMBER_A = "22222222-2222-2222-2222-222222222222";
    const MEMBER_B = "33333333-3333-3333-3333-333333333333";
    setupHappyPath({
      organization_members: {
        data: { org_role: "owner", organization_id: ORG_ID },
        thenable: {
          data: [{ user_id: MEMBER_A }, { user_id: MEMBER_B }],
          error: null,
        },
      },
    });

    await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    // 対象本人 + 配下 2 名 (通常 staff 想定 = is_proxy_account 未設定 → 全凍結) = 3 回
    // §8 prereq cascade 修正後: applyDeletedSuffix には組織コンテキスト (organizationId)
    // が必須で渡される (§9.2 OPS アラートに必要)
    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(3);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      MEMBER_A,
      {
        path: "self_withdrawal",
        actorId: TARGET_ID,
        organizationId: ORG_ID,
      },
    );
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      MEMBER_B,
      {
        path: "self_withdrawal",
        actorId: TARGET_ID,
        organizationId: ORG_ID,
      },
    );
  });

  it("Task 9: applyDeletedSuffix が throw しても退会自体は成功する (非ブロッキング)", async () => {
    setupHappyPath();
    applyDeletedSuffixMock.mockReset();
    applyDeletedSuffixMock.mockRejectedValue(new Error("auth api down"));

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    // ban は印付け失敗にかかわらず実施される (signin ブロックは必須)
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(TARGET_ID, {
      ban_duration: "876600h",
    });
  });

  // -------------------------------------------------------------------------
  // §8 prereq: cascade 修正 — 代理 staff の N 法人継続判定
  // -------------------------------------------------------------------------
  it("§8 prereq: 代理 staff (is_proxy_account=true) + 他組織残存あり → applyDeletedSuffix 呼ばない", async () => {
    const MEMBER_PROXY = "44444444-4444-4444-4444-444444444444";
    setupHappyPath({
      organization_members: {
        // .select(..., { head: true }) で count を 1 (他組織で残存ありを意味する) で返す
        count: 1,
        data: { org_role: "owner", organization_id: ORG_ID },
        thenable: {
          data: [{ user_id: MEMBER_PROXY, is_proxy_account: true }],
          error: null,
        },
      },
    });

    await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    // 対象本人 (Owner 自身) のみ applyDeletedSuffix が呼ばれる。
    // 配下代理 staff は他組織で代理継続中のため凍結されず applyDeletedSuffix 呼ばれない。
    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(1);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_ID,
      expect.objectContaining({ path: "self_withdrawal" }),
    );
    // 代理 staff の ban も呼ばれないこと (Owner 本人だけ ban)
    const banCalls = mockAdminAuthUpdate.mock.calls.map(
      (call) => call[0] as string,
    );
    expect(banCalls).not.toContain(MEMBER_PROXY);
  });

  it("§8 prereq: 代理 staff (is_proxy_account=true) + 他組織残存なし → applyDeletedSuffix + ban を呼ぶ", async () => {
    const MEMBER_PROXY = "44444444-4444-4444-4444-444444444444";
    setupHappyPath({
      organization_members: {
        // count: 0 = 他組織残存なし
        count: 0,
        data: { org_role: "owner", organization_id: ORG_ID },
        thenable: {
          data: [{ user_id: MEMBER_PROXY, is_proxy_account: true }],
          error: null,
        },
      },
    });

    await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    // 対象本人 + 代理 staff (残存なしで全凍結) = 2 回
    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(2);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      MEMBER_PROXY,
      {
        path: "self_withdrawal",
        actorId: TARGET_ID,
        organizationId: ORG_ID,
      },
    );
    expect(mockAdminAuthUpdate).toHaveBeenCalledWith(MEMBER_PROXY, {
      ban_duration: "876600h",
    });
  });

  it("Task 9: 印付けは ban より先に実行される (順序: 印付け → ban)", async () => {
    setupHappyPath();
    const callOrder: string[] = [];
    applyDeletedSuffixMock.mockImplementation(async () => {
      callOrder.push("applyDeletedSuffix");
      return { kind: "applied" as const, recycledEmail: "stub" };
    });
    mockAdminAuthUpdate.mockImplementation(async () => {
      callOrder.push("updateUserById");
      return { data: null, error: null };
    });

    await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    // 順序: applyDeletedSuffix (印付け) → updateUserById (ban 適用)
    const applyIdx = callOrder.indexOf("applyDeletedSuffix");
    const banIdx = callOrder.indexOf("updateUserById");
    expect(applyIdx).toBeGreaterThanOrEqual(0);
    expect(banIdx).toBeGreaterThanOrEqual(0);
    expect(applyIdx).toBeLessThan(banIdx);
  });
});

// ===========================================================================
// §8.5 / §8.5.5 cascade メール送信 (fire-and-forget Promise.all) のエラーパス
//
// 2026-06-28 通知メール runtime 監査の弱点補強。Owner 退会 → 配下メンバーへの
// cascade 通知メールが下記 2 シナリオでも壊れないことを保証する:
//   ③a sendEmail が 1 件目で reject されても 2 件目は試行される (隔離)
//   ③d Owner の applyDeletedSuffix が throw しても cascade メールは発火する (継続)
// ===========================================================================
describe("executeWithdrawal: §8.5 cascade エラーパス", () => {
  const M1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const M2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  /** Owner + N members (全員 regular staff) の cascade シナリオ用 setup */
  function setupOwnerCascade(members: Array<{
    user_id: string;
    email: string;
    last_name: string;
    first_name: string;
  }>) {
    return setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: {
        // hasRemaining 用 count (regular staff では未使用なので 0 でも有害でない)
        count: 0,
        data: { org_role: "owner", organization_id: ORG_ID },
        thenable: {
          data: members.map((m) => ({
            user_id: m.user_id,
            is_proxy_account: false,
          })),
          error: null,
        },
      },
      users: {
        // maybeSingle (snapshotUser / ownerUserRes) 用 — role + 姓名を 1 物にまとめる
        data: { role: "contractor", last_name: "退会", first_name: "代表" },
        // IN ("id", [...]) → memberUserRows 用
        thenable: {
          data: members.map((m) => ({
            id: m.user_id,
            email: m.email,
            last_name: m.last_name,
            first_name: m.first_name,
          })),
          error: null,
        },
      },
      client_profiles: { data: { display_name: "テスト株式会社" } },
      subscriptions: { thenable: { data: [], error: null } },
      option_subscriptions: { thenable: { data: [], error: null } },
    });
  }

  it("③a §8.5 cascade: sendEmail 1 件目 reject でも 2 件目は試行される (Promise.all 内 try/catch で隔離)", async () => {
    setupOwnerCascade([
      {
        user_id: M1,
        email: "m1@test.local",
        last_name: "メンバー",
        first_name: "一郎",
      },
      {
        user_id: M2,
        email: "m2@test.local",
        last_name: "メンバー",
        first_name: "二郎",
      },
    ]);

    // 1 件目 reject、以降 (default) resolve
    sendEmailMock.mockRejectedValueOnce(new Error("smtp down for first recipient"));

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);

    // fire-and-forget Promise.all が drain されるまで poll
    await vi.waitFor(
      () => {
        expect(sendEmailMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 1000 },
    );

    const sentTos = sendEmailMock.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTos).toContain("m1@test.local");
    expect(sentTos).toContain("m2@test.local");
  });

  it("③d Owner の applyDeletedSuffix が throw しても cascade メールは発火する (L169-180 try/catch + 後続継続)", async () => {
    setupOwnerCascade([
      {
        user_id: M1,
        email: "m1@test.local",
        last_name: "メンバー",
        first_name: "一郎",
      },
    ]);

    // 1 件目 (= Owner 自身の applyDeletedSuffix) のみ throw、配下メンバー (call 2+) は default で成功
    applyDeletedSuffixMock.mockRejectedValueOnce(
      new Error("owner suffix failed"),
    );

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "contractor",
    });

    // Owner suffix throw でも success: true
    expect(result.success).toBe(true);
    // 配下メンバー (member 1) の applyDeletedSuffix は呼ばれる (Owner throw が伝播しない)
    expect(applyDeletedSuffixMock).toHaveBeenCalledTimes(2);
    expect(applyDeletedSuffixMock).toHaveBeenCalledWith(
      expect.anything(),
      M1,
      expect.objectContaining({
        path: "self_withdrawal",
        actorId: TARGET_ID,
        organizationId: ORG_ID,
      }),
    );
    // 配下メンバーへの cascade メール送信が 1 件発火
    await vi.waitFor(
      () => {
        expect(sendEmailMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 },
    );
    expect((sendEmailMock.mock.calls[0]?.[0] as { to: string }).to).toBe(
      "m1@test.local",
    );
  });
});

describe("executeWithdrawal: 退会理由 survey", () => {
  it("recordSurvey 指定時に reason_code / reason_label / role / plan_type を保存する", async () => {
    const chains = setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: { data: null },
      users: {
        data: { role: "contractor" },
        thenable: { data: null, error: null },
      },
      subscriptions: {
        thenable: {
          data: [{ plan_type: "corporate", stripe_subscription_id: null }],
          error: null,
        },
      },
      withdrawal_surveys: { thenable: { data: null, error: null } },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      recordSurvey: { reasonCode: "price_high", details: "高い" },
      cancelledBy: "contractor",
    });

    expect(result.success).toBe(true);
    const surveyChain = chains.get("withdrawal_surveys")!;
    expect(surveyChain._inserts).toHaveLength(1);
    expect(surveyChain._inserts[0]).toMatchObject({
      user_id: TARGET_ID,
      reason_code: "price_high",
      reason_label: "料金が高い",
      details: "高い",
      role: "contractor",
      plan_type: "corporate",
    });
  });

  it("recordSurvey なし（admin 削除）では survey を保存しない", async () => {
    const chains = setupTables({
      applications: { count: 0, thenable: { data: [], error: null } },
      organization_members: { data: null },
    });

    const result = await executeWithdrawal({
      targetUserId: TARGET_ID,
      cancelledBy: "admin",
    });

    expect(result.success).toBe(true);
    expect(chains.has("withdrawal_surveys")).toBe(false);
  });
});
