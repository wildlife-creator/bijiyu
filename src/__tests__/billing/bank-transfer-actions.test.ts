import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * requestBankTransferAction（銀行振込の申込、P2）の Server Action テスト。
 *
 * モックは外部境界のみ（Supabase server / admin client、cookies、headers、sendEmail）。
 * Server Action 本体の Zod 検証・ロールガード・事前チェック・申込レコード作成・
 * メール 2 通の送信内容は実際のコードを動かして検証する。
 */

const authState = {
  user: null as null | { id: string },
  userRow: null as null | { id: string; role: string; email: string },
};

interface QueryResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

/**
 * `${op}:${table}` → 結果。select はテーブルごとの既定 [] / null。
 * 同じテーブルを複数回 select するケースは `${op}:${table}:${n}`（n = 呼出順 0,1,…）で個別指定できる。
 */
const adminResults: Record<string, QueryResult> = {};
const sequenceByKey: Record<string, number> = {};
const adminInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
const adminFilters: Array<{ table: string; filters: Record<string, unknown> }> = [];

const sendEmailMock = vi.fn(async (_p: { to: string; subject: string; html: string }) => ({
  success: true as const,
}));

const activeOrgState = { active: null as null | { organizationId: string } };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: authState.userRow, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = "select";
      const filters: Record<string, unknown> = {};
      let insertPayload: Record<string, unknown> | null = null;
      const resolve = () => {
        const key = `${op}:${table}`;
        const seq = sequenceByKey[key] ?? 0;
        sequenceByKey[key] = seq + 1;
        const r = adminResults[`${key}:${seq}`] ?? adminResults[key];
        if (op === "insert") {
          if (insertPayload) adminInserts.push({ table, payload: insertPayload });
          return { data: r?.data ?? { id: "req-1", created_at: "2026-09-01T01:30:00.000Z" }, error: r?.error ?? null };
        }
        adminFilters.push({ table, filters: { ...filters } });
        return { data: r?.data ?? [], error: r?.error ?? null };
      };
      const chain = {
        select() { return chain; },
        eq(col: string, val: unknown) { filters[col] = val; return chain; },
        in(col: string, vals: unknown[]) { filters[col] = vals; return chain; },
        order() { return chain; },
        insert(payload: Record<string, unknown>) { op = "insert"; insertPayload = payload; return chain; },
        limit: async () => resolve(),
        single: async () => {
          const r = resolve();
          return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
        },
        maybeSingle: async () => {
          const r = resolve();
          return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
        },
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/organization/active-org-context", () => ({
  getActiveOrganizationContext: async () => ({ active: activeOrgState.active, all: [] }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({
    get: (name: string) => (name === "host" ? "127.0.0.1:3000" : null),
  }),
}));

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (p: { to: string; subject: string; html: string }) => sendEmailMock(p),
}));

vi.mock("@/lib/email/recipients/billing-recipient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/recipients/billing-recipient")>(
    "@/lib/email/recipients/billing-recipient",
  );
  return {
    ...actual,
    fetchBillingRecipient: async () => ({ email: "user1@test.local", name: "振込商店" }),
  };
});

vi.mock("@/lib/email/recipients/applicant-company-name", () => ({
  resolveApplicantCompanyName: async () => "振込商店",
}));

import { requestBankTransferAction } from "@/app/(authenticated)/billing/bank-transfer-actions";

function resetAll() {
  for (const k of Object.keys(adminResults)) delete adminResults[k];
  for (const k of Object.keys(sequenceByKey)) delete sequenceByKey[k];
  adminInserts.length = 0;
  adminFilters.length = 0;
  sendEmailMock.mockClear();
  activeOrgState.active = null;
  authState.user = { id: "user-1" };
  authState.userRow = { id: "user-1", role: "contractor", email: "user1@test.local" };
  // users（申込者氏名）の maybeSingle
  adminResults["select:users"] = { data: { last_name: "振込", first_name: "一郎" } };
  process.env.OPS_NOTIFICATION_EMAIL = "ops@test.local";
}

beforeEach(resetAll);

describe("requestBankTransferAction — 入力・認証・ロール", () => {
  it("未ログインは拒否", async () => {
    authState.user = null;
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r).toEqual({ success: false, error: "ログインしてください" });
  });

  it("担当者（staff）は申し込めない", async () => {
    authState.userRow = { id: "user-1", role: "staff", email: "s@test.local" };
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("担当者アカウント");
    expect(adminInserts).toHaveLength(0);
  });

  it("不正な入力（未知のプラン）は Zod で拒否", async () => {
    const r = await requestBankTransferAction({
      type: "plan",
      planType: "free" as never,
      billingCycle: "monthly",
    });
    expect(r).toEqual({ success: false, error: "入力内容が正しくありません" });
  });
});

describe("requestBankTransferAction — プラン申込", () => {
  it("初回申込: 事務手数料込みで申込レコードを作り、申込者控え + 運営宛の 2 通を送る", async () => {
    const r = await requestBankTransferAction({ type: "plan", planType: "small", billingCycle: "yearly" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data?.requestId).toBe("req-1");
      expect(r.data?.targetLabel).toBe("スタンダードプラン（年払い）");
    }

    expect(adminInserts).toHaveLength(1);
    expect(adminInserts[0]!.table).toBe("bank_transfer_requests");
    expect(adminInserts[0]!.payload).toMatchObject({
      user_id: "user-1",
      target_kind: "plan",
      plan_type: "small",
      option_type: null,
      job_id: null,
      billing_cycle: "yearly",
      amount: 14800 * 12,
      initial_fee: 20000,
      status: "requested",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const [userMail, opsMail] = sendEmailMock.mock.calls.map((c) => c[0]);
    expect(userMail!.to).toBe("user1@test.local");
    expect(userMail!.subject).toBe("【ビジ友】銀行振込でのお申し込みを受け付けました");
    expect(userMail!.html).toContain("スタンダードプラン（年払い）");
    expect(userMail!.html).not.toMatch(/円/);
    expect(opsMail!.to).toBe("ops@test.local");
    expect(opsMail!.subject).toContain("【ビジ友 運営】銀行振込のお申し込み");
    expect(opsMail!.html).toContain("177,600円（税込）");
    expect(opsMail!.html).toContain("20,000円（税込）");
    expect(opsMail!.html).toContain("http://127.0.0.1:3000/admin/bank-transfers/req-1");
  });

  it("過去に契約歴（解約済み行）があれば事務手数料なし", async () => {
    // subscriptions の select は「active/past_due 確認」（1 回目）→「契約歴確認」（2 回目）の順
    adminResults["select:subscriptions:0"] = { data: [] };
    adminResults["select:subscriptions:1"] = { data: [{ id: "old-cancelled" }] };
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r.success).toBe(true);
    expect(adminInserts[0]!.payload.initial_fee).toBe(0);
    expect(adminInserts[0]!.payload.amount).toBe(3800);
  });

  it("有効なプランが既にあれば拒否（Stripe 契約中の二重契約防止）", async () => {
    adminResults["select:subscriptions"] = { data: [{ id: "sub-1" }] };
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("すでにご契約中のプラン");
    expect(adminInserts).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("処理中の申込があれば拒否（受付中メッセージ）", async () => {
    adminResults["select:bank_transfer_requests"] = { data: [{ id: "open-1" }] };
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r).toEqual({
      success: false,
      error: "銀行振込でのお申し込みを受付中です。請求書のご案内をお待ちください",
    });
  });

  it("INSERT が一意制約違反（23505）なら受付中メッセージに変換", async () => {
    adminResults["insert:bank_transfer_requests"] = {
      data: null,
      error: { message: "duplicate key", code: "23505" },
    };
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("受付中");
  });

  it("INSERT がその他のエラーなら汎用エラー。メールは送らない", async () => {
    adminResults["insert:bank_transfer_requests"] = { data: null, error: { message: "boom" } };
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("受付に失敗");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("OPS_NOTIFICATION_EMAIL 未設定なら運営宛は送らず、申込者控えのみ", async () => {
    delete process.env.OPS_NOTIFICATION_EMAIL;
    const r = await requestBankTransferAction({ type: "plan", planType: "individual", billingCycle: "monthly" });
    expect(r.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("requestBankTransferAction — オプション申込", () => {
  it("職場紹介動画は有料プラン加入者のみ", async () => {
    adminResults["select:subscriptions"] = { data: [] };
    const r = await requestBankTransferAction({ type: "option", optionType: "video_workplace" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("発注者プラン加入者のみ");
  });

  it("職場紹介動画: 有料プランがあれば買い切り 100,000 円で受付（事務手数料なし）", async () => {
    adminResults["select:subscriptions"] = { data: [{ id: "sub-1" }] };
    const r = await requestBankTransferAction({ type: "option", optionType: "video_workplace" });
    expect(r.success).toBe(true);
    expect(adminInserts[0]!.payload).toMatchObject({
      target_kind: "option",
      option_type: "video_workplace",
      plan_type: null,
      amount: 100000,
      initial_fee: 0,
      billing_cycle: "monthly",
    });
  });

  it("ユーザー撮影プラン（P7）: 有料プランがなくても買い切り 20,000 円で受付（事務手数料なし）", async () => {
    adminResults["select:subscriptions"] = { data: [] };
    const r = await requestBankTransferAction({ type: "option", optionType: "video_shooting" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.targetLabel).toContain("ユーザー撮影プラン");
    expect(adminInserts[0]!.payload).toMatchObject({
      target_kind: "option",
      option_type: "video_shooting",
      plan_type: null,
      amount: 20000,
      initial_fee: 0,
      billing_cycle: "monthly",
    });
  });

  it("補償は既に加入していれば拒否、なければ年払い 12 か月分で受付", async () => {
    adminResults["select:option_subscriptions"] = { data: [{ id: "opt-1" }] };
    const dup = await requestBankTransferAction({
      type: "option",
      optionType: "compensation_5000",
      billingCycle: "monthly",
    });
    expect(dup.success).toBe(false);

    adminResults["select:option_subscriptions"] = { data: [] };
    const ok = await requestBankTransferAction({
      type: "option",
      optionType: "compensation_9800",
      billingCycle: "yearly",
    });
    expect(ok.success).toBe(true);
    expect(adminInserts.at(-1)!.payload).toMatchObject({
      option_type: "compensation_9800",
      billing_cycle: "yearly",
      amount: 9800 * 12,
    });
  });

  it("急募: 自分の案件でなければ拒否、自分の案件なら job_id 付きで受付", async () => {
    adminResults["select:jobs"] = {
      data: { id: "job-1", owner_id: "someone-else", organization_id: null, is_urgent: false },
    };
    const denied = await requestBankTransferAction({
      type: "option",
      optionType: "urgent",
      jobId: "11111111-1111-4111-8111-111111111111",
    });
    expect(denied.success).toBe(false);
    if (!denied.success) expect(denied.error).toContain("権限");

    adminResults["select:jobs"] = {
      data: { id: "job-1", owner_id: "user-1", organization_id: null, is_urgent: false },
    };
    adminResults["select:option_subscriptions"] = { data: [] };
    const ok = await requestBankTransferAction({
      type: "option",
      optionType: "urgent",
      jobId: "11111111-1111-4111-8111-111111111111",
    });
    expect(ok.success).toBe(true);
    expect(adminInserts.at(-1)!.payload).toMatchObject({
      option_type: "urgent",
      job_id: "11111111-1111-4111-8111-111111111111",
      amount: 20000,
    });
  });

  it("急募: 組織メンバーの案件なら組織コンテキストで許可", async () => {
    adminResults["select:jobs"] = {
      data: { id: "job-1", owner_id: "owner-x", organization_id: "org-1", is_urgent: false },
    };
    activeOrgState.active = { organizationId: "org-1" };
    adminResults["select:option_subscriptions"] = { data: [] };
    const ok = await requestBankTransferAction({
      type: "option",
      optionType: "urgent",
      jobId: "11111111-1111-4111-8111-111111111111",
    });
    expect(ok.success).toBe(true);
  });
});
