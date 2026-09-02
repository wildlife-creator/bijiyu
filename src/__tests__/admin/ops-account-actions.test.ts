import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPS_ACCOUNT_PERIOD_END_DATE,
  OPS_ACCOUNT_PLAN_TYPE,
} from "@/lib/admin/ops-account";

import {
  createInMemoryAdminClient,
  createInMemoryDb,
  type InMemoryDb,
  type Row,
} from "../video/in-memory-admin-client";

/**
 * ADM-009 管理運営アカウントの設定 / 解除 Server Action（P5、書き込み + 権限系のためフルテスト）。
 *
 * Server Action 自体はモックせず、grantBankTransferPlan の副作用（契約行・role 昇格・
 * client_profiles・組織作成 RPC・監査ログ）まで実際に動かす。メール送信はモック。
 */

const ADMIN_ID = "44444444-4444-4444-4444-444444444444";
const USER_ID = "0b500000-0000-4000-8000-000000000002";

const auth = { ok: true as boolean };
vi.mock("@/lib/admin/require-admin", () => ({
  requireAdmin: async () =>
    auth.ok
      ? { ok: true, adminId: ADMIN_ID }
      : { ok: false, error: "この操作を行う権限がありません" },
}));

let db: InMemoryDb;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createInMemoryAdminClient(db),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendPlanActivatedEmailMock = vi.fn(async () => undefined);
vi.mock("@/lib/billing/activation-emails", () => ({
  sendPlanActivatedEmail: (...args: unknown[]) =>
    sendPlanActivatedEmailMock(...(args as [])),
}));
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: async () => ({ success: true }),
}));

const { setOpsAccountAction, unsetOpsAccountAction } = await import(
  "@/app/admin/(protected)/users/[id]/ops-account-actions"
);

function user(overrides: Partial<Row>): Row {
  return {
    id: USER_ID,
    role: "contractor",
    deleted_at: null,
    is_hidden: false,
    last_name: "運営",
    first_name: "候補",
    ...overrides,
  };
}

const t = (name: string) => db.tables[name] ?? [];

beforeEach(() => {
  auth.ok = true;
  db = createInMemoryDb({
    users: [user({})],
    subscriptions: [],
    client_profiles: [],
    audit_logs: [],
  });
  sendPlanActivatedEmailMock.mockClear();
});

describe("setOpsAccountAction", () => {
  it("受注者を設定すると非表示 + ハイエンド銀行振込行 + client 昇格 + 組織作成 + 監査が揃う", async () => {
    const result = await setOpsAccountAction(USER_ID);
    expect(result).toEqual({ success: true });

    expect(t("users")[0]).toMatchObject({ is_hidden: true, role: "client" });

    expect(t("subscriptions")).toHaveLength(1);
    const sub = t("subscriptions")[0];
    expect(sub).toMatchObject({
      user_id: USER_ID,
      plan_type: OPS_ACCOUNT_PLAN_TYPE,
      status: "active",
      payment_method: "bank_transfer",
      billing_cycle: "yearly",
      stripe_subscription_id: null,
    });
    // 期限は 2099-12-31 の JST 末（UTC では 14:59:59Z）
    expect(String(sub.current_period_end)).toContain(OPS_ACCOUNT_PERIOD_END_DATE);

    expect(t("client_profiles")[0]).toMatchObject({
      user_id: USER_ID,
      display_name: "運営候補",
    });
    expect(db.rpcCalls).toEqual([
      { name: "ensure_organization_exists", args: { uid: USER_ID } },
    ]);

    const actions = t("audit_logs").map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["role_changed", "subscription_created", "ops_account_set"]),
    );
    const setLog = t("audit_logs").find((a) => a.action === "ops_account_set");
    expect(setLog).toMatchObject({
      actor_id: ADMIN_ID,
      target_id: USER_ID,
      metadata: { granted: true, planType: OPS_ACCOUNT_PLAN_TYPE, previousRole: "contractor" },
    });

    // 内部アカウントなので有効化メールは送らない
    expect(sendPlanActivatedEmailMock).not.toHaveBeenCalled();
  });

  it("既に発注者（client）なら role 変更の監査は出ず、既存の表示名を維持する", async () => {
    db.tables.users = [user({ role: "client" })];
    db.tables.client_profiles = [{ user_id: USER_ID, display_name: "ビジ友 運営" }];
    const result = await setOpsAccountAction(USER_ID);
    expect(result.success).toBe(true);
    expect(t("client_profiles")).toHaveLength(1);
    expect(t("client_profiles")[0]?.display_name).toBe("ビジ友 運営");
    expect(t("audit_logs").map((a) => a.action)).not.toContain("role_changed");
  });

  it("ハイエンドの銀行振込契約が既にあれば契約は作らず非表示だけ設定する（冪等）", async () => {
    db.tables.subscriptions = [
      { id: "sub-1", user_id: USER_ID, plan_type: "corporate_premium", payment_method: "bank_transfer", status: "active" },
    ];
    db.tables.users = [user({ role: "client" })];
    const result = await setOpsAccountAction(USER_ID);
    expect(result.success).toBe(true);
    expect(t("subscriptions")).toHaveLength(1);
    expect(t("users")[0]?.is_hidden).toBe(true);
    expect(
      t("audit_logs").find((a) => a.action === "ops_account_set")?.metadata,
    ).toMatchObject({ granted: false, subscriptionId: "sub-1" });
  });

  it("別プラン（Stripe）を契約中なら拒否し、何も書かない", async () => {
    db.tables.subscriptions = [
      { id: "sub-s", user_id: USER_ID, plan_type: "small", payment_method: "stripe", status: "active" },
    ];
    db.tables.users = [user({ role: "client" })];
    const result = await setOpsAccountAction(USER_ID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("スタンダード");
    expect(t("users")[0]?.is_hidden).toBe(false);
    expect(t("audit_logs")).toHaveLength(0);
  });

  it("退会済み・admin / staff ロール・存在しないユーザーは拒否する", async () => {
    db.tables.users = [user({ deleted_at: "2026-08-01T00:00:00Z" })];
    expect((await setOpsAccountAction(USER_ID)).success).toBe(false);

    db.tables.users = [user({ role: "staff" })];
    expect((await setOpsAccountAction(USER_ID)).success).toBe(false);

    db.tables.users = [user({ role: "admin" })];
    expect((await setOpsAccountAction(USER_ID)).success).toBe(false);

    db.tables.users = [];
    expect((await setOpsAccountAction(USER_ID)).success).toBe(false);

    expect(t("subscriptions")).toHaveLength(0);
  });

  it("admin 以外は実行できない", async () => {
    auth.ok = false;
    const result = await setOpsAccountAction(USER_ID);
    expect(result).toEqual({ success: false, error: "この操作を行う権限がありません" });
    expect(t("users")[0]?.is_hidden).toBe(false);
  });

  it("契約行の INSERT に失敗したら success:false で非表示にもしない", async () => {
    db.failures.subscriptions = { insert: { message: "boom" } };
    const result = await setOpsAccountAction(USER_ID);
    expect(result.success).toBe(false);
    expect(t("users")[0]?.is_hidden).toBe(false);
  });
});

describe("unsetOpsAccountAction", () => {
  it("非表示を戻すだけで契約行はそのまま、監査ログを残す", async () => {
    db.tables.users = [user({ role: "client", is_hidden: true })];
    db.tables.subscriptions = [
      { id: "sub-1", user_id: USER_ID, plan_type: "corporate_premium", payment_method: "bank_transfer", status: "active" },
    ];
    const result = await unsetOpsAccountAction(USER_ID);
    expect(result).toEqual({ success: true });
    expect(t("users")[0]?.is_hidden).toBe(false);
    expect(t("subscriptions")).toHaveLength(1);
    expect(t("audit_logs")[0]).toMatchObject({
      action: "ops_account_unset",
      actor_id: ADMIN_ID,
      target_id: USER_ID,
    });
  });

  it("既に通常の会員なら何もしない", async () => {
    const result = await unsetOpsAccountAction(USER_ID);
    expect(result).toEqual({ success: true });
    expect(t("audit_logs")).toHaveLength(0);
  });

  it("admin 以外は実行できない", async () => {
    auth.ok = false;
    db.tables.users = [user({ is_hidden: true })];
    const result = await unsetOpsAccountAction(USER_ID);
    expect(result.success).toBe(false);
    expect(t("users")[0]?.is_hidden).toBe(true);
  });
});
