import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleCheckoutCompleted } from "@/lib/billing/webhook/handle-checkout-completed";

/**
 * Lightweight Supabase admin client mock that lets each test specify the
 * shape returned for select / insert / update / rpc calls.
 *
 * Tests inspect the recorded calls log to assert what the handler did.
 */
interface FakeOpResult {
  data?: unknown;
  error?: { message: string } | null;
}

interface FakeAdminConfig {
  /**
   * Maps `from(table) → select(...).eq(...).in(...).limit(...)` results.
   * Keyed by table name.
   */
  selectByTable?: Record<string, FakeOpResult>;
  /** Insert result per table. */
  insertByTable?: Record<string, FakeOpResult>;
  /** Update result per table. */
  updateByTable?: Record<string, FakeOpResult>;
  /** Upsert result per table. */
  upsertByTable?: Record<string, FakeOpResult>;
  /** RPC results keyed by function name. */
  rpcResults?: Record<string, FakeOpResult>;
  /** auth.admin.getUserById が返す user_metadata（招待フローの会社名反映用） */
  userMetadata?: Record<string, unknown>;
}

interface CallLog {
  op: "from" | "insert" | "update" | "select" | "rpc" | "upsert" | "getUserById";
  table?: string;
  fn?: string;
  payload?: unknown;
  options?: unknown;
}

function makeAdmin(config: FakeAdminConfig) {
  const calls: CallLog[] = [];

  function buildBuilder(table: string) {
    const builder = {
      _filters: {} as Record<string, unknown>,
      select: vi.fn(function (this: typeof builder) {
        return this;
      }),
      eq: vi.fn(function (this: typeof builder, col: string, val: unknown) {
        this._filters[col] = val;
        return this;
      }),
      in: vi.fn(function (this: typeof builder, col: string, vals: unknown[]) {
        this._filters[col] = vals;
        return this;
      }),
      is: vi.fn(function (this: typeof builder) {
        return this;
      }),
      maybeSingle: vi.fn(function () {
        const result = config.selectByTable?.[table] ?? { data: null, error: null };
        calls.push({ op: "select", table });
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      }),
      single: vi.fn(function () {
        const result = config.selectByTable?.[table] ?? { data: null, error: null };
        calls.push({ op: "select", table });
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      }),
      limit: vi.fn(function (this: typeof builder) {
        const result = config.selectByTable?.[table] ?? { data: [], error: null };
        calls.push({ op: "select", table });
        return Promise.resolve({
          data: result.data ?? [],
          error: result.error ?? null,
        });
      }),
      insert: vi.fn(function (payload: unknown) {
        calls.push({ op: "insert", table, payload });
        const result = config.insertByTable?.[table] ?? { error: null };
        // Hybrid return: awaitable directly (existing call sites) AND chainable
        // `.select(...).single()` (used by handleCompensationOption after §6.5).
        const resolveValue = {
          data: result.data ?? null,
          error: result.error ?? null,
        };
        const promise = Promise.resolve(resolveValue);
        const chain = {
          select: vi.fn(function () {
            return {
              single: vi.fn(() => Promise.resolve(resolveValue)),
            };
          }),
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        };
        return chain;
      }),
      update: vi.fn(function (payload: unknown) {
        calls.push({ op: "update", table, payload });
        const result = config.updateByTable?.[table] ?? { error: null };
        // chained .eq()
        return {
          eq: vi.fn(() =>
            Promise.resolve({
              data: result.data ?? null,
              error: result.error ?? null,
            }),
          ),
        };
      }),
      upsert: vi.fn(function (payload: unknown, options?: unknown) {
        calls.push({ op: "upsert", table, payload, options });
        const result = config.upsertByTable?.[table] ?? { error: null };
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      }),
    };
    return builder;
  }

  const admin = {
    from: vi.fn((table: string) => {
      calls.push({ op: "from", table });
      return buildBuilder(table);
    }),
    rpc: vi.fn((fn: string, payload: unknown) => {
      calls.push({ op: "rpc", fn, payload });
      const result = config.rpcResults?.[fn] ?? { data: null, error: null };
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      });
    }),
    auth: {
      admin: {
        getUserById: vi.fn((userId: string) => {
          calls.push({ op: "getUserById", payload: userId });
          return Promise.resolve({
            data: {
              user: { id: userId, user_metadata: config.userMetadata ?? {} },
            },
            error: null,
          });
        }),
      },
    },
  };

  return { admin: admin as never, calls };
}

function makeSession(
  metadata: Record<string, string>,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    metadata,
    subscription: "sub_test_123",
    customer: "cus_test_123",
    payment_intent: "pi_test_123",
    ...overrides,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// metadata.type routing
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted routing", () => {
  it("throws on unknown metadata.type", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(admin, makeSession({ type: "mystery" })),
    ).rejects.toThrow(/unknown metadata.type/);
  });

  it("throws when metadata.type is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(admin, makeSession({})),
    ).rejects.toThrow(/unknown metadata.type/);
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'plan'
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (plan)", () => {
  it("calls the handle_checkout_completed_plan RPC with the right payload", async () => {
    const { admin, calls } = makeAdmin({
      rpcResults: { handle_checkout_completed_plan: { data: {}, error: null } },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "plan",
        plan_type: "individual",
        user_id: "user-1",
      }),
    );

    const rpcCall = calls.find((c) => c.op === "rpc");
    expect(rpcCall?.fn).toBe("handle_checkout_completed_plan");
    expect(rpcCall?.payload).toMatchObject({
      event_data: {
        user_id: "user-1",
        plan_type: "individual",
        stripe_subscription_id: "sub_test_123",
        stripe_customer_id: "cus_test_123",
      },
    });
  });

  it("招待フロー: invited_company_name があれば RPC より先に client_profiles へ会社名を upsert する", async () => {
    const { admin, calls } = makeAdmin({
      rpcResults: { handle_checkout_completed_plan: { data: {}, error: null } },
      userMetadata: { invited_company_name: "テスト建設株式会社" },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "plan",
        plan_type: "corporate",
        user_id: "invited-user-1",
      }),
    );

    const upsertIndex = calls.findIndex(
      (c) => c.op === "upsert" && c.table === "client_profiles",
    );
    const rpcIndex = calls.findIndex((c) => c.op === "rpc");

    // RPC が display_name を姓名で必ず埋めるため、会社名 upsert は RPC より「前」
    expect(upsertIndex).toBeGreaterThanOrEqual(0);
    expect(rpcIndex).toBeGreaterThan(upsertIndex);

    const upsertCall = calls[upsertIndex];
    expect(upsertCall.payload).toMatchObject({
      user_id: "invited-user-1",
      display_name: "テスト建設株式会社",
    });
    // 冪等性: 既存行（本人編集済み display_name 含む）は上書きしない
    expect(upsertCall.options).toMatchObject({
      onConflict: "user_id",
      ignoreDuplicates: true,
    });
  });

  it("通常サインアップ（invited_company_name なし）では upsert しない", async () => {
    const { admin, calls } = makeAdmin({
      rpcResults: { handle_checkout_completed_plan: { data: {}, error: null } },
      userMetadata: {},
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "plan",
        plan_type: "individual",
        user_id: "user-1",
      }),
    );

    expect(
      calls.some((c) => c.op === "upsert" && c.table === "client_profiles"),
    ).toBe(false);
  });

  it("rethrows when the RPC returns an error", async () => {
    const { admin } = makeAdmin({
      rpcResults: {
        handle_checkout_completed_plan: {
          error: { message: "duplicate active subscription detected" },
        },
      },
    });

    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "plan",
          plan_type: "small",
          user_id: "user-2",
        }),
      ),
    ).rejects.toThrow(/duplicate active subscription/);
  });

  it("throws when subscription id is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession(
          { type: "plan", plan_type: "individual", user_id: "user-3" },
          { subscription: null },
        ),
      ),
    ).rejects.toThrow(/no subscription id/);
  });

  it("throws when user_id metadata is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({ type: "plan", plan_type: "individual" }),
      ),
    ).rejects.toThrow(/missing user_id/);
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / compensation
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (compensation option)", () => {
  it("inserts an option_subscriptions row (no client_profiles write)", async () => {
    const { admin, calls } = makeAdmin({
      selectByTable: { option_subscriptions: { data: [], error: null } },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "compensation_5000",
        user_id: "user-cmp",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-cmp",
      payment_type: "subscription",
      stripe_subscription_id: "sub_test_123",
      option_type: "compensation_5000",
      status: "active",
    });

    // client_profiles のフラグカラムは廃止済み。書き込みが発生しないことを検証
    expect(
      calls.find((c) => c.op === "update" && c.table === "client_profiles"),
    ).toBeUndefined();
  });

  it("uses compensation_9800 option_type for the higher tier (no client_profiles write)", async () => {
    const { admin, calls } = makeAdmin({
      selectByTable: { option_subscriptions: { data: [], error: null } },
    });
    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "compensation_9800",
        user_id: "user-cmp",
      }),
    );
    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      option_type: "compensation_9800",
      status: "active",
    });
    expect(
      calls.find((c) => c.op === "update" && c.table === "client_profiles"),
    ).toBeUndefined();
  });

  it("二重防御: throws when an active compensation already exists", async () => {
    const { admin, calls } = makeAdmin({
      selectByTable: {
        option_subscriptions: { data: [{ id: "existing-id" }], error: null },
      },
    });
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "option",
          option_type: "compensation_5000",
          user_id: "user-cmp",
        }),
      ),
    ).rejects.toThrow(/duplicate compensation option/);
    // Should not have inserted anything
    expect(
      calls.find((c) => c.op === "insert" && c.table === "option_subscriptions"),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / urgent
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (urgent option)", () => {
  it("inserts a one_time option_subscription with end_date 7 days out", async () => {
    const { admin, calls } = makeAdmin({});

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "urgent",
        user_id: "user-u",
        job_id: "job-99",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-u",
      job_id: "job-99",
      payment_type: "one_time",
      stripe_payment_intent_id: "pi_test_123",
      option_type: "urgent",
      status: "active",
    });
    const payload = insert?.payload as { start_date: string; end_date: string };
    const start = new Date(payload.start_date).getTime();
    const end = new Date(payload.end_date).getTime();
    // ~7 days difference (allow 1 minute slack)
    expect(end - start).toBeGreaterThan(7 * 24 * 3600 * 1000 - 60_000);
    expect(end - start).toBeLessThan(7 * 24 * 3600 * 1000 + 60_000);

    // Also flips client_profiles.is_urgent_option and jobs.is_urgent
    const cpUpdate = calls.find(
      (c) => c.op === "update" && c.table === "client_profiles",
    );
    expect(cpUpdate?.payload).toEqual({ is_urgent_option: true });
    const jobUpdate = calls.find(
      (c) => c.op === "update" && c.table === "jobs",
    );
    expect(jobUpdate?.payload).toEqual({ is_urgent: true });
  });

  it("throws when job_id metadata is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "option",
          option_type: "urgent",
          user_id: "user-u",
        }),
      ),
    ).rejects.toThrow(/missing job_id/);
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / video
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (video option)", () => {
  it("inserts a one_time option_subscription with end_date null", async () => {
    const { admin, calls } = makeAdmin({});

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "video",
        user_id: "user-v",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-v",
      payment_type: "one_time",
      stripe_payment_intent_id: "pi_test_123",
      option_type: "video",
      status: "active",
      end_date: null,
    });
  });
});

// ---------------------------------------------------------------------------
// metadata.type === 'option' / video_workplace（職場紹介動画掲載）
// ---------------------------------------------------------------------------

describe("handleCheckoutCompleted (video_workplace option)", () => {
  it("inserts a one_time option_subscription with end_date null and option_type video_workplace", async () => {
    const { admin, calls } = makeAdmin({});

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "video_workplace",
        user_id: "user-vw",
      }),
    );

    const insert = calls.find(
      (c) => c.op === "insert" && c.table === "option_subscriptions",
    );
    expect(insert?.payload).toMatchObject({
      user_id: "user-vw",
      payment_type: "one_time",
      stripe_payment_intent_id: "pi_test_123",
      option_type: "video_workplace",
      status: "active",
      end_date: null,
    });
  });

  it("throws when payment_intent is missing", async () => {
    const { admin } = makeAdmin({});
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession(
          {
            type: "option",
            option_type: "video_workplace",
            user_id: "user-vw",
          },
          { payment_intent: null },
        ),
      ),
    ).rejects.toThrow(/no payment_intent/);
  });

  it("rethrows when the insert returns an error", async () => {
    const { admin } = makeAdmin({
      insertByTable: {
        option_subscriptions: { error: { message: "insert boom" } },
      },
    });
    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "option",
          option_type: "video_workplace",
          user_id: "user-vw",
        }),
      ),
    ).rejects.toThrow(/video_workplace option_subscriptions insert failed/);
  });
});

// ---------------------------------------------------------------------------
// §6.5.A 補償オプション申し込み完了メール送信
// ---------------------------------------------------------------------------

type SendArgs = { to: string; subject: string; html: string };
const SEND = vi.fn(async (_args: SendArgs) => ({ success: true as const }));

beforeEach(() => {
  SEND.mockClear();
});

describe("handleCheckoutCompleted §6.5.A compensation email", () => {
  it("compensation_5000 申込 → §6.5.A optionLabel + activatedAt 入りのメールを申込者へ送信", async () => {
    const { admin } = makeAdmin({
      selectByTable: {
        option_subscriptions: { data: [], error: null },
        users: {
          data: {
            email: "cmp@test.local",
            last_name: "田中",
            first_name: "太郎",
            client_profiles: null,
          },
        },
      },
      insertByTable: {
        option_subscriptions: { data: { created_at: "2026-06-01T03:00:00.000Z" } },
      },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "compensation_5000",
        user_id: "user-cmp",
      }),
      { sendEmail: SEND as never },
    );

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as SendArgs;
    expect(args.to).toBe("cmp@test.local");
    expect(args.subject).toBe(
      "【ビジ友】補償オプションのお申し込みを承りました",
    );
    expect(args.html).toContain("田中太郎 様");
    expect(args.html).toContain("補償（5,000円/月、最大200万円）");
    expect(args.html).toContain("2026/06/01");
  });

  it("compensation_9800 申込 → optionLabel が 9,800 円表記に切り替わる", async () => {
    const { admin } = makeAdmin({
      selectByTable: {
        option_subscriptions: { data: [], error: null },
        users: {
          data: {
            email: "cmp2@test.local",
            last_name: "佐藤",
            first_name: "花子",
            client_profiles: null,
          },
        },
      },
      insertByTable: {
        option_subscriptions: { data: { created_at: "2026-06-15T03:00:00.000Z" } },
      },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "compensation_9800",
        user_id: "user-cmp2",
      }),
      { sendEmail: SEND as never },
    );

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as SendArgs;
    expect(args.html).toContain("補償（9,800円/月、最大500万円）");
  });

  it("§6.6.A urgent 申込 → 件名に jobTitle 含む 急募申込完了メールを案件オーナーへ送信 (個人プラン = 1 通)", async () => {
    const { admin } = makeAdmin({
      selectByTable: {
        // jobs SELECT (sendUrgentActivatedEmails 内の maybeSingle)
        jobs: {
          data: {
            title: "渋谷区マンション新築 鉄筋工",
            owner_id: "user-owner",
            organization_id: null,
          },
        },
        // getJobClientRecipients 個人プラン分岐の users.single()
        users: {
          data: {
            id: "user-owner",
            email: "owner@test.local",
            last_name: "山田",
            first_name: "太郎",
            deleted_at: null,
            is_active: true,
          },
        },
      },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "option",
        option_type: "urgent",
        user_id: "user-owner",
        job_id: "job-99",
      }),
      { sendEmail: SEND as never },
    );

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as {
      to: string;
      subject: string;
      html: string;
    };
    expect(args.to).toBe("owner@test.local");
    expect(args.subject).toBe(
      "【ビジ友】「渋谷区マンション新築 鉄筋工」の急募オプションお申し込みを承りました",
    );
    expect(args.html).toContain("山田太郎 様");
    expect(args.html).toContain("急募期間");
    expect(args.html).toContain("7 日間");
  });

  it("§6.7 plan checkout → 件名は「プランのお申し込みを承りました」、planName + activatedAt を含むメールを Owner 1 名に送信", async () => {
    const { admin } = makeAdmin({
      rpcResults: { handle_checkout_completed_plan: { data: {}, error: null } },
      selectByTable: {
        users: {
          data: {
            email: "owner@test.local",
            last_name: "山田",
            first_name: "太郎",
            client_profiles: null,
          },
        },
      },
    });

    await handleCheckoutCompleted(
      admin,
      makeSession({
        type: "plan",
        plan_type: "corporate",
        user_id: "user-owner",
      }),
      { sendEmail: SEND as never },
    );

    expect(SEND).toHaveBeenCalledOnce();
    const args = SEND.mock.calls[0]![0]! as {
      to: string;
      subject: string;
      html: string;
    };
    expect(args.to).toBe("owner@test.local");
    expect(args.subject).toBe("【ビジ友】プランのお申し込みを承りました");
    expect(args.html).toContain("山田太郎 様");
    expect(args.html).toContain("法人向けプラン");
    expect(args.html).toContain("お申し込みプラン");
    expect(args.html).toContain("ご利用開始日");
  });

  it("§6.7 fetchBillingRecipient が null → throw せず redirect 続行 (メール send skip)", async () => {
    const { admin } = makeAdmin({
      rpcResults: { handle_checkout_completed_plan: { data: {}, error: null } },
      selectByTable: { users: { data: null } },
    });

    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "plan",
          plan_type: "individual",
          user_id: "user-missing",
        }),
        { sendEmail: SEND as never },
      ),
    ).resolves.toBeUndefined();

    expect(SEND).not.toHaveBeenCalled();
  });

  it("fetchRecipient が null → メール送信 skip（throw しない）", async () => {
    const { admin } = makeAdmin({
      selectByTable: {
        option_subscriptions: { data: [], error: null },
        users: { data: null },
      },
      insertByTable: {
        option_subscriptions: { data: { created_at: "2026-06-01T03:00:00.000Z" } },
      },
    });

    await expect(
      handleCheckoutCompleted(
        admin,
        makeSession({
          type: "option",
          option_type: "compensation_5000",
          user_id: "user-cmp-missing",
        }),
        { sendEmail: SEND as never },
      ),
    ).resolves.toBeUndefined();

    expect(SEND).not.toHaveBeenCalled();
  });
});
