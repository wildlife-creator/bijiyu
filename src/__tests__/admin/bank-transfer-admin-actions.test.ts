import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADM-009 / ADM-004 の「銀行振込」枠の Server Action（P12）。
 * - activateBankTransferPlanAction: 有効プランなし → 銀行振込行（期限なし）+ role 昇格 +
 *   client_profiles + 法人なら組織作成 + 有効化メール + 監査
 * - changeBankSubscriptionPlanAction: 即時変更（ダウングレードは前提条件チェック）
 * - cancelBankSubscriptionAction: 無効化（RPC で Stripe 解約と同じ後処理 + 解約完了メール）
 * - switchStripeToBankTransferAction: Stripe 即時解約 → 同じ行を銀行振込に書き換え
 * - activateBankTransferVideoOptionAction: 動画プランの買い切り行 + 購入完了メール
 *
 * Supabase / Stripe 境界のみモック。Action 本体のロジックは実コードを動かす。
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
const rpcResults: Record<string, QueryResult> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      const r = rpcResults[fn];
      return { data: r?.data ?? null, error: r?.error ?? null };
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
  sendVideoActivatedEmails: async (...args: unknown[]) => { sentEmails.push({ fn: "video", args }); },
}));

const plainEmails: Array<{ to: string; subject: string }> = [];
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: async (p: { to: string; subject: string }) => { plainEmails.push(p); return { success: true }; },
}));
vi.mock("@/lib/email/recipients/billing-recipient", () => ({
  fetchBillingRecipient: async () => ({ name: "振込一郎", email: "bank@test.local" }),
  formatBillingDate: (iso: string) => iso.slice(0, 10).replaceAll("-", "/"),
}));
vi.mock("@/lib/email-recycle/apply-deleted-suffix", () => ({
  applyDeletedSuffix: async () => undefined,
}));

const downgradeState = { ok: true, errors: [] as string[] };
vi.mock("@/lib/billing/validate-downgrade", () => ({
  validateDowngradePrerequisites: async () =>
    downgradeState.ok ? { ok: true, errors: [] } : { ok: false, errors: downgradeState.errors },
}));

const stripeCalls: Array<{ fn: string; args: unknown[] }> = [];
const stripeState = {
  schedule: null as string | null,
  cancelError: null as Error | null,
};
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    subscriptions: {
      retrieve: async (id: string) => {
        stripeCalls.push({ fn: "subscriptions.retrieve", args: [id] });
        return { id, schedule: stripeState.schedule };
      },
      cancel: async (id: string) => {
        stripeCalls.push({ fn: "subscriptions.cancel", args: [id] });
        if (stripeState.cancelError) throw stripeState.cancelError;
        return { id, status: "canceled" };
      },
    },
    subscriptionSchedules: {
      release: async (id: string) => {
        stripeCalls.push({ fn: "subscriptionSchedules.release", args: [id] });
        return { id };
      },
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import {
  activateBankTransferPlanAction,
  activateBankTransferVideoOptionAction,
  cancelBankSubscriptionAction,
  changeBankSubscriptionPlanAction,
  switchStripeToBankTransferAction,
} from "@/app/admin/(protected)/clients/[id]/bank-subscription-actions";

const USER_ID = "aa000000-0000-4000-8000-000000000001";
const SUB_ID = "cc000000-0000-4000-8000-000000000001";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function reset() {
  for (const k of Object.keys(adminResults)) delete adminResults[k];
  for (const k of Object.keys(sequenceByKey)) delete sequenceByKey[k];
  for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  adminInserts.length = 0;
  adminUpdates.length = 0;
  adminUpserts.length = 0;
  rpcCalls.length = 0;
  auditLogs.length = 0;
  sentEmails.length = 0;
  plainEmails.length = 0;
  stripeCalls.length = 0;
  stripeState.schedule = null;
  stripeState.cancelError = null;
  downgradeState.ok = true;
  downgradeState.errors = [];
  authState.user = { id: "admin-1" };
  authState.role = "admin";
  adminResults["select:users"] = {
    data: { id: USER_ID, role: "contractor", deleted_at: null, last_name: "振込", first_name: "一郎" },
  };
  adminResults["select:subscriptions"] = { data: null };
  adminResults["insert:subscriptions"] = { data: { id: SUB_ID } };
}

beforeEach(reset);

describe("認可", () => {
  it("admin 以外はどの操作も拒否", async () => {
    authState.role = "client";
    const r1 = await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }));
    const r2 = await changeBankSubscriptionPlanAction(SUB_ID, fd({ planType: "small" }));
    const r3 = await cancelBankSubscriptionAction(SUB_ID);
    const r4 = await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "small" }));
    const r5 = await activateBankTransferVideoOptionAction(USER_ID, fd({ optionType: "video" }));
    for (const r of [r1, r2, r3, r4, r5]) {
      expect(r).toEqual({ success: false, error: "この操作を行う権限がありません" });
    }
    expect(adminInserts).toHaveLength(0);
    expect(adminUpdates).toHaveLength(0);
  });
});

describe("activateBankTransferPlanAction（有効にする）", () => {
  it("受注者にプレミアムを付ける: 期限なしの銀行振込行・role 昇格・client_profiles・組織作成・有効化メール・監査", async () => {
    const r = await activateBankTransferPlanAction(USER_ID, fd({ planType: "corporate" }));
    expect(r).toEqual({ success: true });

    const subInsert = adminInserts.find((i) => i.table === "subscriptions");
    expect(subInsert?.payload).toMatchObject({
      user_id: USER_ID,
      plan_type: "corporate",
      status: "active",
      payment_method: "bank_transfer",
      billing_cycle: "monthly",
      stripe_subscription_id: null,
      current_period_end: null,
    });
    expect(subInsert?.payload.current_period_start).toBeTruthy();

    const roleUpdate = adminUpdates.find((u) => u.table === "users");
    expect(roleUpdate?.payload).toEqual({ role: "client" });
    expect(adminUpserts.find((u) => u.table === "client_profiles")?.payload).toEqual({
      user_id: USER_ID,
      display_name: "振込一郎",
    });
    expect(rpcCalls).toContainEqual({ fn: "ensure_organization_exists", args: { uid: USER_ID } });
    expect(sentEmails.map((e) => e.fn)).toEqual(["plan"]);
    const log = auditLogs.find((a) => a.action === "bank_transfer_activate");
    expect(log).toMatchObject({ targetId: SUB_ID, metadata: { user_id: USER_ID, plan_type: "corporate" } });
  });

  it("ライト（個人プラン）なら組織は作らない。既に client なら role を触らない", async () => {
    adminResults["select:users"] = {
      data: { id: USER_ID, role: "client", deleted_at: null, last_name: "振込", first_name: "花子" },
    };
    const r = await activateBankTransferPlanAction(USER_ID, fd({ planType: "individual" }));
    expect(r.success).toBe(true);
    expect(rpcCalls).toHaveLength(0);
    expect(adminUpdates.find((u) => u.table === "users")).toBeUndefined();
  });

  it("カード払いで契約中なら「切り替える」を案内して拒否、銀行振込中なら「変更する」を案内して拒否", async () => {
    adminResults["select:subscriptions"] = { data: { id: SUB_ID, payment_method: "stripe" } };
    const r1 = await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }));
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.error).toContain("銀行振込に切り替える");

    adminResults["select:subscriptions"] = { data: { id: SUB_ID, payment_method: "bank_transfer" } };
    const r2 = await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }));
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error).toContain("変更する");
    expect(adminInserts).toHaveLength(0);
  });

  it("契約行 INSERT が一意制約違反なら「既にあります」で止まる", async () => {
    adminResults["insert:subscriptions"] = { data: null, error: { message: "dup", code: "23505" } };
    const r = await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("既に");
    expect(sentEmails).toHaveLength(0);
  });

  it("退会済み / 担当者 / 管理者 / 不正なプランは拒否", async () => {
    adminResults["select:users"] = { data: { id: USER_ID, role: "contractor", deleted_at: "2026-01-01" } };
    expect((await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }))).success).toBe(false);
    adminResults["select:users"] = { data: { id: USER_ID, role: "staff", deleted_at: null } };
    expect((await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }))).success).toBe(false);
    adminResults["select:users"] = { data: { id: USER_ID, role: "admin", deleted_at: null } };
    expect((await activateBankTransferPlanAction(USER_ID, fd({ planType: "small" }))).success).toBe(false);
    adminResults["select:users"] = { data: { id: USER_ID, role: "contractor", deleted_at: null } };
    expect((await activateBankTransferPlanAction(USER_ID, fd({ planType: "free" }))).success).toBe(false);
    expect(adminInserts).toHaveLength(0);
  });
});

describe("changeBankSubscriptionPlanAction（変更する）", () => {
  beforeEach(() => {
    adminResults["select:subscriptions"] = {
      data: { id: SUB_ID, user_id: USER_ID, plan_type: "small", status: "active", payment_method: "bank_transfer" },
    };
  });

  it("アップグレード（スタンダード → プレミアム）は即時更新し、組織を作り、監査を残す", async () => {
    const r = await changeBankSubscriptionPlanAction(SUB_ID, fd({ planType: "corporate" }));
    expect(r).toEqual({ success: true });
    const upd = adminUpdates.find((u) => u.table === "subscriptions");
    expect(upd?.payload).toEqual({ plan_type: "corporate" });
    expect(upd?.filters).toMatchObject({ id: SUB_ID, payment_method: "bank_transfer" });
    expect(rpcCalls).toContainEqual({ fn: "ensure_organization_exists", args: { uid: USER_ID } });
    expect(auditLogs.find((a) => a.action === "bank_transfer_plan_change")?.metadata).toMatchObject({
      from: "small",
      to: "corporate",
    });
  });

  it("ダウングレードは前提条件を満たさなければ拒否", async () => {
    downgradeState.ok = false;
    downgradeState.errors = ["掲載中の案件が上限を超えています"];
    const r = await changeBankSubscriptionPlanAction(SUB_ID, fd({ planType: "individual" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("ダウングレードできません");
    expect(adminUpdates).toHaveLength(0);
  });

  it("同じプラン / カード契約 / 無効な契約は拒否", async () => {
    const same = await changeBankSubscriptionPlanAction(SUB_ID, fd({ planType: "small" }));
    expect(same).toEqual({ success: false, error: "現在と同じプランです" });

    adminResults["select:subscriptions"] = {
      data: { id: SUB_ID, user_id: USER_ID, plan_type: "small", status: "active", payment_method: "stripe" },
    };
    const stripe = await changeBankSubscriptionPlanAction(SUB_ID, fd({ planType: "corporate" }));
    expect(stripe.success).toBe(false);

    adminResults["select:subscriptions"] = {
      data: { id: SUB_ID, user_id: USER_ID, plan_type: "small", status: "cancelled", payment_method: "bank_transfer" },
    };
    const cancelled = await changeBankSubscriptionPlanAction(SUB_ID, fd({ planType: "corporate" }));
    expect(cancelled).toEqual({ success: false, error: "この契約は既に無効です" });
  });
});

describe("cancelBankSubscriptionAction（無効にする）", () => {
  it("RPC（subscription_id 指定）で解約後処理を実行し、解約完了メールと監査を残す", async () => {
    adminResults["select:subscriptions"] = {
      data: { id: SUB_ID, user_id: USER_ID, plan_type: "small", status: "active", payment_method: "bank_transfer" },
    };
    rpcResults["handle_subscription_lifecycle_deleted"] = { data: { globally_deleted_user_ids: [] } };
    const r = await cancelBankSubscriptionAction(SUB_ID);
    expect(r).toEqual({ success: true });
    expect(rpcCalls).toContainEqual({
      fn: "handle_subscription_lifecycle_deleted",
      args: { event_data: { subscription_id: SUB_ID, actor_id: "admin-1" } },
    });
    expect(plainEmails).toHaveLength(1);
    expect(plainEmails[0]?.to).toBe("bank@test.local");
    expect(auditLogs.map((a) => a.action)).toContain("bank_transfer_cancel_subscription");
  });

  it("RPC が失敗したらエラー（メールは送らない）", async () => {
    adminResults["select:subscriptions"] = {
      data: { id: SUB_ID, user_id: USER_ID, plan_type: "small", status: "active", payment_method: "bank_transfer" },
    };
    rpcResults["handle_subscription_lifecycle_deleted"] = { error: { message: "boom" } };
    const r = await cancelBankSubscriptionAction(SUB_ID);
    expect(r).toEqual({ success: false, error: "無効化に失敗しました" });
    expect(plainEmails).toHaveLength(0);
  });
});

describe("switchStripeToBankTransferAction（カード払い → 銀行振込）", () => {
  const stripeSub = {
    id: SUB_ID,
    user_id: USER_ID,
    plan_type: "small",
    status: "active",
    payment_method: "stripe",
    stripe_subscription_id: "sub_stripe_1",
    schedule_id: null,
  };

  beforeEach(() => {
    adminResults["select:subscriptions"] = { data: stripeSub };
    adminResults["select:users"] = {
      data: { id: USER_ID, role: "client", deleted_at: null, last_name: "振込", first_name: "花子" },
    };
  });

  it("Stripe を即時解約し、同じ行を銀行振込（期限なし・予約系クリア）に書き換える", async () => {
    const r = await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "small" }));
    expect(r).toEqual({ success: true });
    expect(stripeCalls.map((c) => c.fn)).toEqual(["subscriptions.retrieve", "subscriptions.cancel"]);
    const upd = adminUpdates.find((u) => u.table === "subscriptions");
    expect(upd?.filters).toEqual({ id: SUB_ID });
    expect(upd?.payload).toMatchObject({
      payment_method: "bank_transfer",
      stripe_subscription_id: null,
      plan_type: "small",
      billing_cycle: "monthly",
      status: "active",
      cancel_at_period_end: false,
      schedule_id: null,
      scheduled_plan_type: null,
      scheduled_billing_cycle: null,
      scheduled_at: null,
      past_due_since: null,
      current_period_end: null,
    });
    expect(auditLogs.find((a) => a.action === "bank_transfer_switch_from_stripe")?.metadata).toMatchObject({
      cancelled_stripe_subscription_id: "sub_stripe_1",
      from_plan: "small",
      to_plan: "small",
    });
    // 契約は途切れないので解約後処理の RPC は呼ばない
    expect(rpcCalls).toHaveLength(0);
  });

  it("ダウングレード予約（Schedule）があれば先に解放してから解約する。プレミアムへ変えるなら組織も作る", async () => {
    stripeState.schedule = "sub_sched_1";
    const r = await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "corporate" }));
    expect(r).toEqual({ success: true });
    expect(stripeCalls.map((c) => c.fn)).toEqual([
      "subscriptions.retrieve",
      "subscriptionSchedules.release",
      "subscriptions.cancel",
    ]);
    expect(rpcCalls).toContainEqual({ fn: "ensure_organization_exists", args: { uid: USER_ID } });
  });

  it("Stripe の解約に失敗したら DB は触らない", async () => {
    stripeState.cancelError = new Error("stripe down");
    const r = await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "small" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("カード払いの停止に失敗");
    expect(adminUpdates).toHaveLength(0);
  });

  it("Stripe は止まったが DB 更新に失敗したら、「有効にする」で設定し直す案内を返す", async () => {
    adminResults["update:subscriptions"] = { error: { message: "db down" } };
    const r = await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "small" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("「有効にする」");
    expect(stripeCalls.map((c) => c.fn)).toContain("subscriptions.cancel");
  });

  it("銀行振込行 / 終了済み / ダウングレード不可 は拒否（Stripe を呼ばない）", async () => {
    adminResults["select:subscriptions"] = { data: { ...stripeSub, payment_method: "bank_transfer", stripe_subscription_id: null } };
    expect((await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "small" }))).success).toBe(false);

    adminResults["select:subscriptions"] = { data: { ...stripeSub, status: "cancelled" } };
    expect((await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "small" }))).success).toBe(false);

    adminResults["select:subscriptions"] = { data: stripeSub };
    downgradeState.ok = false;
    downgradeState.errors = ["担当者数が上限を超えています"];
    const r = await switchStripeToBankTransferAction(SUB_ID, fd({ planType: "individual" }));
    expect(r.success).toBe(false);
    expect(stripeCalls).toHaveLength(0);
  });
});

describe("activateBankTransferVideoOptionAction（動画プランを有効にする）", () => {
  it("買い切り（期限なし）の銀行振込行を作り、購入完了メールと監査を残す", async () => {
    adminResults["insert:option_subscriptions"] = { data: { id: "opt-1" } };
    const r = await activateBankTransferVideoOptionAction(USER_ID, fd({ optionType: "video_sns" }));
    expect(r).toEqual({ success: true });
    const ins = adminInserts.find((i) => i.table === "option_subscriptions");
    expect(ins?.payload).toMatchObject({
      user_id: USER_ID,
      payment_type: "one_time",
      payment_method: "bank_transfer",
      option_type: "video_sns",
      status: "active",
      end_date: null,
    });
    expect(sentEmails.map((e) => e.fn)).toEqual(["video"]);
    expect(auditLogs.find((a) => a.action === "bank_transfer_option_activate")).toMatchObject({
      targetId: "opt-1",
      metadata: { user_id: USER_ID, option_type: "video_sns" },
    });
  });

  it("旧 職場紹介動画（video_workplace）や補償・急募は対象外として拒否", async () => {
    for (const optionType of ["video_workplace", "compensation_5000", "urgent"]) {
      const r = await activateBankTransferVideoOptionAction(USER_ID, fd({ optionType }));
      expect(r).toEqual({ success: false, error: "動画プランを選択してください" });
    }
    expect(adminInserts).toHaveLength(0);
  });

  it("退会済みの会員には付けない", async () => {
    adminResults["select:users"] = { data: { id: USER_ID, role: "contractor", deleted_at: "2026-01-01" } };
    const r = await activateBankTransferVideoOptionAction(USER_ID, fd({ optionType: "video" }));
    expect(r.success).toBe(false);
    expect(adminInserts).toHaveLength(0);
  });
});
