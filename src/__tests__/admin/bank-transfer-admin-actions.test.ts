import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-026 銀行振込申込の管理 Server Action（P2）。
 * - markBankTransferInvoicedAction: requested → invoiced、audit log
 * - activateBankTransferAction: 開始日検証 / 二重契約防止 / 契約行作成 + role 昇格 +
 *   client_profiles + 法人なら組織作成 / 申込を paid に / 有効化メール
 * - cancelBankTransferRequestAction: open → cancelled、理由をメモに残す
 *
 * Supabase 境界のみモック。Action 本体のロジックは実コードを動かす。
 */

const authState = {
  user: null as null | { id: string },
  role: "admin" as string | null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.role ? { role: authState.role } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

interface QueryResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

const adminResults: Record<string, QueryResult> = {};
const sequenceByKey: Record<string, number> = {};
const adminInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
const adminUpdates: Array<{ table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }> = [];
const adminUpserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
    from: (table: string) => {
      let op = "select";
      const filters: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      const resolve = () => {
        const key = `${op}:${table}`;
        const seq = sequenceByKey[key] ?? 0;
        sequenceByKey[key] = seq + 1;
        const r = adminResults[`${key}:${seq}`] ?? adminResults[key];
        if (op === "insert" && payload) adminInserts.push({ table, payload });
        if (op === "update" && payload) adminUpdates.push({ table, payload, filters: { ...filters } });
        if (op === "upsert" && payload) adminUpserts.push({ table, payload });
        if (op === "insert") {
          return { data: r?.data ?? { id: `${table}-new` }, error: r?.error ?? null };
        }
        if (op === "update" || op === "upsert") {
          return { data: r?.data ?? null, error: r?.error ?? null };
        }
        return { data: r?.data ?? [], error: r?.error ?? null };
      };
      const one = (r: { data: unknown; error: unknown }) => ({
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        error: r.error,
      });
      const chain = {
        select() { return chain; },
        eq(col: string, val: unknown) { filters[col] = val; return chain; },
        in(col: string, vals: unknown[]) { filters[col] = vals; return chain; },
        order() { return chain; },
        insert(p: Record<string, unknown>) { op = "insert"; payload = p; return chain; },
        update(p: Record<string, unknown>) { op = "update"; payload = p; return chain; },
        upsert(p: Record<string, unknown>) { op = "upsert"; payload = p; return chain; },
        // 実 Supabase と同じく `.limit(1).maybeSingle()` も `await ...limit(1)` も通す
        limit() { return chain; },
        single: async () => one(resolve()),
        maybeSingle: async () => one(resolve()),
        then(onFulfilled: (v: unknown) => unknown) {
          return Promise.resolve(resolve()).then(onFulfilled);
        },
      };
      return chain;
    },
  }),
}));

const auditLogs: Array<{ action: string; targetId: string; metadata?: unknown }> = [];
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: async (p: { action: string; targetId: string; metadata?: unknown }) => {
    auditLogs.push(p);
  },
}));

const sentEmails: Array<{ fn: string; args: unknown[] }> = [];
vi.mock("@/lib/billing/activation-emails", () => ({
  sendPlanActivatedEmail: async (...args: unknown[]) => { sentEmails.push({ fn: "plan", args }); },
  sendCompensationActivatedEmail: async (...args: unknown[]) => { sentEmails.push({ fn: "compensation", args }); },
  sendUrgentActivatedEmails: async (...args: unknown[]) => { sentEmails.push({ fn: "urgent", args }); },
  sendVideoActivatedEmails: async (...args: unknown[]) => { sentEmails.push({ fn: "video", args }); },
}));

vi.mock("@/lib/email/send-email", () => ({ sendEmail: async () => ({ success: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import {
  activateBankTransferAction,
  cancelBankTransferRequestAction,
  createBankTransferRequestByAdminAction,
  markBankTransferInvoicedAction,
} from "@/app/admin/(protected)/bank-transfers/actions";

const REQUEST_ID = "dd000000-0000-4000-8000-000000000001";

function planRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    user_id: "user-1",
    target_kind: "plan",
    plan_type: "corporate",
    option_type: null,
    job_id: null,
    billing_cycle: "monthly",
    amount: 48000,
    initial_fee: 20000,
    status: "invoiced",
    admin_memo: null,
    ...overrides,
  };
}

function reset() {
  for (const k of Object.keys(adminResults)) delete adminResults[k];
  for (const k of Object.keys(sequenceByKey)) delete sequenceByKey[k];
  adminInserts.length = 0;
  adminUpdates.length = 0;
  adminUpserts.length = 0;
  rpcCalls.length = 0;
  auditLogs.length = 0;
  sentEmails.length = 0;
  authState.user = { id: "admin-1" };
  authState.role = "admin";
  adminResults["select:bank_transfer_requests"] = { data: planRequest() };
  adminResults["select:users"] = {
    data: { id: "user-1", role: "contractor", deleted_at: null, last_name: "振込", first_name: "一郎" },
  };
  adminResults["select:subscriptions"] = { data: null };
  adminResults["insert:subscriptions"] = { data: { id: "sub-new-1" } };
}

beforeEach(reset);

describe("認可", () => {
  it("admin 以外は拒否", async () => {
    authState.role = "client";
    const r = await markBankTransferInvoicedAction(REQUEST_ID);
    expect(r).toEqual({ success: false, error: "この操作を行う権限がありません" });
    expect(adminUpdates).toHaveLength(0);
  });
});

describe("markBankTransferInvoicedAction", () => {
  it("requested → invoiced に更新し、監査ログを残す", async () => {
    adminResults["select:bank_transfer_requests"] = { data: planRequest({ status: "requested" }) };
    const r = await markBankTransferInvoicedAction(REQUEST_ID);
    expect(r).toEqual({ success: true });
    const upd = adminUpdates.find((u) => u.table === "bank_transfer_requests");
    expect(upd?.payload).toMatchObject({ status: "invoiced", handled_by: "admin-1" });
    expect(upd?.payload.invoiced_at).toBeTruthy();
    expect(auditLogs.map((a) => a.action)).toContain("bank_transfer_invoiced");
  });

  it("既に invoiced なら拒否、paid / cancelled は処理済みとして拒否", async () => {
    const already = await markBankTransferInvoicedAction(REQUEST_ID); // fixture は invoiced
    expect(already.success).toBe(false);
    if (!already.success) expect(already.error).toContain("既に請求書送付済");

    adminResults["select:bank_transfer_requests"] = { data: planRequest({ status: "paid" }) };
    const paid = await markBankTransferInvoicedAction(REQUEST_ID);
    expect(paid.success).toBe(false);
    if (!paid.success) expect(paid.error).toContain("処理済み");
  });

  it("申込が見つからなければエラー", async () => {
    adminResults["select:bank_transfer_requests"] = { data: null };
    const r = await markBankTransferInvoicedAction(REQUEST_ID);
    expect(r).toEqual({ success: false, error: "対象の申込が見つかりません" });
  });
});

describe("activateBankTransferAction — プラン", () => {
  function fd(startDate: string) {
    const f = new FormData();
    f.set("startDate", startDate);
    return f;
  }

  it("開始日が不正なら拒否", async () => {
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026/09/01"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("YYYY-MM-DD");
    expect(adminInserts).toHaveLength(0);
  });

  it("法人プラン: 契約行（bank_transfer・期限=開始日+1か月-1日）を作り、role 昇格・client_profiles・組織作成・申込 paid・メール送信", async () => {
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.periodEnd).toBe("2026/10/14");

    const subInsert = adminInserts.find((i) => i.table === "subscriptions");
    expect(subInsert?.payload).toMatchObject({
      user_id: "user-1",
      plan_type: "corporate",
      status: "active",
      payment_method: "bank_transfer",
      billing_cycle: "monthly",
      stripe_subscription_id: null,
      current_period_start: "2026-09-14T15:00:00.000Z", // 09/15 00:00 JST
      current_period_end: "2026-10-14T14:59:59.000Z", // 10/14 23:59:59 JST
    });

    // role: contractor → client
    const roleUpdate = adminUpdates.find((u) => u.table === "users");
    expect(roleUpdate?.payload).toEqual({ role: "client" });
    expect(adminInserts.some((i) => i.table === "audit_logs" && i.payload.action === "role_changed")).toBe(true);

    // client_profiles（既存があれば維持）
    expect(adminUpserts.find((u) => u.table === "client_profiles")?.payload).toEqual({
      user_id: "user-1",
      display_name: "振込一郎",
    });

    // 法人 → 組織作成
    expect(rpcCalls).toContainEqual({ fn: "ensure_organization_exists", args: { uid: "user-1" } });

    // 申込を paid に
    const reqUpdate = adminUpdates.find((u) => u.table === "bank_transfer_requests");
    expect(reqUpdate?.payload).toMatchObject({
      status: "paid",
      start_date: "2026-09-15",
      handled_by: "admin-1",
      activated_subscription_id: "sub-new-1",
      activated_option_subscription_id: null,
    });

    expect(auditLogs.map((a) => a.action)).toContain("bank_transfer_activate");
    expect(sentEmails.map((e) => e.fn)).toEqual(["plan"]);
  });

  it("個人プラン（ライト）: 年払いは +1 年、組織作成はしない。既に client なら role を触らない", async () => {
    adminResults["select:bank_transfer_requests"] = {
      data: planRequest({ plan_type: "individual", billing_cycle: "yearly" }),
    };
    adminResults["select:users"] = {
      data: { id: "user-1", role: "client", deleted_at: null, last_name: "振込", first_name: "一郎" },
    };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.periodEnd).toBe("2027/09/14");
    expect(rpcCalls).toHaveLength(0);
    expect(adminUpdates.find((u) => u.table === "users")).toBeUndefined();
  });

  it("有効なプランが既にあれば拒否（Stripe 契約中は期間終了日を案内）", async () => {
    adminResults["select:subscriptions"] = {
      data: { id: "sub-stripe", payment_method: "stripe", current_period_end: "2026-09-30T14:59:59.000Z" },
    };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("クレジットカードでプランをご契約中");
      expect(r.error).toContain("2026/09/30");
    }
    expect(adminInserts.find((i) => i.table === "subscriptions")).toBeUndefined();
    expect(sentEmails).toHaveLength(0);
  });

  it("契約行 INSERT が一意制約違反なら「既にあります」で止まり、申込は paid にしない", async () => {
    adminResults["insert:subscriptions"] = { data: null, error: { message: "dup", code: "23505" } };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(false);
    expect(adminUpdates.find((u) => u.table === "bank_transfer_requests")).toBeUndefined();
  });

  it("申込者が退会済みなら有効化できない", async () => {
    adminResults["select:users"] = {
      data: { id: "user-1", role: "client", deleted_at: "2026-08-01T00:00:00Z", last_name: "振込", first_name: "一郎" },
    };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r).toEqual({ success: false, error: "申込者が退会済みのため有効化できません" });
  });

  it("処理済み（paid）の申込は再度有効化できない", async () => {
    adminResults["select:bank_transfer_requests"] = { data: planRequest({ status: "paid" }) };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("処理済み");
  });
});

describe("activateBankTransferAction — オプション", () => {
  function fd(startDate: string) {
    const f = new FormData();
    f.set("startDate", startDate);
    return f;
  }

  it("職場紹介動画: 買い切り（期限なし）で option_subscriptions を作り、動画メールを送る", async () => {
    adminResults["select:bank_transfer_requests"] = {
      data: planRequest({ target_kind: "option", plan_type: null, option_type: "video_workplace", amount: 100000, initial_fee: 0 }),
    };
    adminResults["insert:option_subscriptions"] = { data: { id: "opt-new-1" } };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.periodEnd).toBeNull();
    expect(adminInserts.find((i) => i.table === "option_subscriptions")?.payload).toMatchObject({
      user_id: "user-1",
      payment_type: "one_time",
      payment_method: "bank_transfer",
      option_type: "video_workplace",
      status: "active",
      end_date: null,
    });
    expect(adminUpdates.find((u) => u.table === "bank_transfer_requests")?.payload).toMatchObject({
      status: "paid",
      activated_option_subscription_id: "opt-new-1",
      activated_subscription_id: null,
    });
    expect(sentEmails.map((e) => e.fn)).toEqual(["video"]);
  });

  it("ユーザー撮影プラン（P7）: 買い切り（期限なし）で option_subscriptions を作り、動画メールを送る", async () => {
    adminResults["select:bank_transfer_requests"] = {
      data: planRequest({ target_kind: "option", plan_type: null, option_type: "video_shooting", amount: 20000, initial_fee: 0 }),
    };
    adminResults["insert:option_subscriptions"] = { data: { id: "opt-new-vs" } };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.periodEnd).toBeNull();
    expect(adminInserts.find((i) => i.table === "option_subscriptions")?.payload).toMatchObject({
      user_id: "user-1",
      payment_type: "one_time",
      payment_method: "bank_transfer",
      option_type: "video_shooting",
      status: "active",
      end_date: null,
    });
    expect(adminUpdates.find((u) => u.table === "bank_transfer_requests")?.payload).toMatchObject({
      status: "paid",
      activated_option_subscription_id: "opt-new-vs",
    });
    expect(sentEmails.map((e) => e.fn)).toEqual(["video"]);
  });

  it("急募: 7 日間の期限で作成し、案件と client_profiles のフラグを立てる", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    adminResults["select:bank_transfer_requests"] = {
      data: planRequest({ target_kind: "option", plan_type: null, option_type: "urgent", job_id: jobId, amount: 20000, initial_fee: 0 }),
    };
    adminResults["select:jobs"] = { data: { id: jobId, status: "open" } };
    adminResults["select:option_subscriptions"] = { data: [] };
    adminResults["insert:option_subscriptions"] = { data: { id: "opt-urgent" } };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data?.periodEnd).toBe("2026/09/22");
    expect(adminInserts.find((i) => i.table === "option_subscriptions")?.payload).toMatchObject({
      option_type: "urgent",
      job_id: jobId,
      payment_method: "bank_transfer",
    });
    expect(adminUpdates.find((u) => u.table === "client_profiles")?.payload).toEqual({ is_urgent_option: true });
    expect(adminUpdates.find((u) => u.table === "jobs")?.payload).toEqual({ is_urgent: true });
    expect(sentEmails.map((e) => e.fn)).toEqual(["urgent"]);
  });

  it("補償: 既に加入していれば拒否", async () => {
    adminResults["select:bank_transfer_requests"] = {
      data: planRequest({ target_kind: "option", plan_type: null, option_type: "compensation_5000", amount: 5000, initial_fee: 0 }),
    };
    adminResults["select:option_subscriptions"] = { data: [{ id: "opt-existing" }] };
    const r = await activateBankTransferAction(REQUEST_ID, fd("2026-09-15"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("既に補償オプション");
  });
});

describe("cancelBankTransferRequestAction", () => {
  it("open → cancelled、理由をメモに追記し監査ログを残す", async () => {
    adminResults["select:bank_transfer_requests"] = { data: planRequest({ admin_memo: "請求書 No.123 送付" }) };
    const f = new FormData();
    f.set("memo", "申込者から取消の連絡");
    const r = await cancelBankTransferRequestAction(REQUEST_ID, f);
    expect(r).toEqual({ success: true });
    const upd = adminUpdates.find((u) => u.table === "bank_transfer_requests");
    expect(upd?.payload).toMatchObject({ status: "cancelled", handled_by: "admin-1" });
    expect(upd?.payload.admin_memo).toBe("請求書 No.123 送付\n【取消理由】申込者から取消の連絡");
    expect(auditLogs.find((a) => a.action === "bank_transfer_cancel")?.metadata).toMatchObject({
      reason: "申込者から取消の連絡",
    });
  });

  it("メモが 2000 字超なら拒否", async () => {
    const f = new FormData();
    f.set("memo", "あ".repeat(2001));
    const r = await cancelBankTransferRequestAction(REQUEST_ID, f);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("2000文字以内");
  });
});

// ---------------------------------------------------------------------------
// P9: createBankTransferRequestByAdminAction（運営による代理登録）
// ---------------------------------------------------------------------------
describe("createBankTransferRequestByAdminAction（P9 代理登録）", () => {
  function fd(fields: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  }

  beforeEach(() => {
    // 会員検索（email 完全一致）
    adminResults["select:users"] = {
      data: { id: "user-1", role: "contractor", email: "member@test.local", deleted_at: null },
    };
    // 契約なし（= 初回事務手数料あり）/ 処理中の申込なし
    adminResults["select:subscriptions"] = { data: [] };
    adminResults["select:bank_transfer_requests"] = { data: [] };
    adminResults["insert:bank_transfer_requests"] = {
      data: { id: "req-new-1", created_at: "2026-09-04T01:00:00Z" },
    };
  });

  it("プラン（ライト・年払い）: 初回事務手数料込みで申込受付を作り、運営メモ・handled_by・監査ログ・控えメール", async () => {
    const r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "plan", planType: "individual", billingCycle: "yearly" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data?.requestId).toBe("req-new-1");
      expect(r.data?.targetLabel).toContain("ライトプラン");
    }
    const insert = adminInserts.find((i) => i.table === "bank_transfer_requests");
    expect(insert?.payload).toMatchObject({
      user_id: "user-1",
      target_kind: "plan",
      plan_type: "individual",
      option_type: null,
      billing_cycle: "yearly",
      amount: 45600,
      initial_fee: 20000,
      status: "requested",
      handled_by: "admin-1",
    });
    expect(String(insert?.payload.admin_memo)).toContain("代理登録");
    expect(auditLogs.map((a) => a.action)).toContain("bank_transfer_requested_by_admin");
  });

  it("契約歴があれば初回事務手数料なし", async () => {
    // 1 回目: active/past_due なし、2 回目: 過去の契約あり
    adminResults["select:subscriptions:0"] = { data: [] };
    adminResults["select:subscriptions:1"] = { data: [{ id: "old-sub" }] };
    const r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "plan", planType: "small", billingCycle: "monthly" }),
    );
    expect(r.success).toBe(true);
    expect(adminInserts.find((i) => i.table === "bank_transfer_requests")?.payload).toMatchObject({
      amount: 14800,
      initial_fee: 0,
    });
  });

  it("オプション（ユーザー撮影プラン）: 買い切り 20,000 円・事務手数料なし", async () => {
    const r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "option", optionType: "video_shooting" }),
    );
    expect(r.success).toBe(true);
    expect(adminInserts.find((i) => i.table === "bank_transfer_requests")?.payload).toMatchObject({
      target_kind: "option",
      option_type: "video_shooting",
      plan_type: null,
      amount: 20000,
      initial_fee: 0,
    });
  });

  it("該当会員なし / 退会済み / 担当者 / 管理者 は登録できない", async () => {
    adminResults["select:users"] = { data: null };
    let r = await createBankTransferRequestByAdminAction(
      fd({ email: "nobody@test.local", targetKind: "plan", planType: "individual" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("見つかりません");

    adminResults["select:users"] = { data: { id: "u", role: "contractor", email: "x", deleted_at: "2026-01-01T00:00:00Z" } };
    r = await createBankTransferRequestByAdminAction(fd({ email: "x@test.local", targetKind: "plan", planType: "individual" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("退会済み");

    adminResults["select:users"] = { data: { id: "u", role: "staff", email: "x", deleted_at: null } };
    r = await createBankTransferRequestByAdminAction(fd({ email: "x@test.local", targetKind: "plan", planType: "individual" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("担当者");

    adminResults["select:users"] = { data: { id: "u", role: "admin", email: "x", deleted_at: null } };
    r = await createBankTransferRequestByAdminAction(fd({ email: "x@test.local", targetKind: "plan", planType: "individual" }));
    expect(r.success).toBe(false);
    expect(adminInserts).toHaveLength(0);
  });

  it("契約中のプランがあれば拒否、処理中の申込があれば受付中メッセージ", async () => {
    adminResults["select:subscriptions"] = { data: [{ id: "sub-active" }] };
    let r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "plan", planType: "individual" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("契約中のプラン");

    adminResults["select:subscriptions"] = { data: [] };
    adminResults["select:bank_transfer_requests"] = { data: [{ id: "open-1" }] };
    r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "plan", planType: "individual" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("受付中");
    expect(adminInserts).toHaveLength(0);
  });

  it("補償は販売停止中（P8 フラグ未設定）なら代理登録もできない / 不正入力は拒否", async () => {
    delete process.env.NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED;
    let r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "option", optionType: "compensation_5000", billingCycle: "yearly" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("現在お申し込みを受け付けていません");

    r = await createBankTransferRequestByAdminAction(fd({ email: "not-an-email", targetKind: "plan", planType: "individual" }));
    expect(r.success).toBe(false);

    r = await createBankTransferRequestByAdminAction(fd({ email: "member@test.local", targetKind: "option", optionType: "urgent" }));
    expect(r.success).toBe(false);
    expect(adminInserts).toHaveLength(0);
  });

  it("admin 以外は拒否", async () => {
    authState.role = "contractor";
    const r = await createBankTransferRequestByAdminAction(
      fd({ email: "member@test.local", targetKind: "plan", planType: "individual" }),
    );
    expect(r.success).toBe(false);
  });
});
