import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for changePlanAction and related plan-change Server Actions.
 *
 * We mock all external deps:
 *   - @/lib/supabase/server → returns a controlled auth client
 *   - @/lib/supabase/admin → returns a controlled admin client
 *   - @/lib/billing/stripe → returns a controlled Stripe client
 *   - @/lib/billing/validate-downgrade → controllable result
 */

// ---- mock state -----

const authState = {
  user: null as null | { id: string },
  userRow: null as null | { role: string },
};

const subState = {
  row: null as null | {
    id: string;
    user_id: string;
    plan_type: string;
    status: string;
    stripe_subscription_id: string;
    schedule_id: string | null;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  },
};

const stripeMock = {
  subscriptions: {
    retrieve: vi.fn(async () => ({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_individual" } }] },
      // 型を string | null に広げる（mockResolvedValueOnce で "sub_sched_xxx" を返せるように）
      schedule: null as string | null,
      cancel_at_period_end: false,
    })),
    update: vi.fn(async () => ({})),
    cancel: vi.fn(async () => ({})),
  },
  subscriptionSchedules: {
    create: vi.fn(async () => ({
      id: "sub_sched_1",
      phases: [
        {
          items: [{ price: "price_corporate", quantity: 1 }],
          start_date: 1000,
          end_date: 2000,
        },
      ],
    })),
    update: vi.fn(async () => ({})),
    release: vi.fn(async () => ({})),
  },
  billingPortal: {
    sessions: {
      create: vi.fn(async () => ({ url: "https://billing.stripe.com/test" })),
    },
  },
};

type ValidationResult = { ok: true } | { ok: false; errors: string[] };
const validateMock = vi.fn(async (): Promise<ValidationResult> => ({ ok: true }));

const adminInserts: Array<{ table: string; payload: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: authState.userRow,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const adminUserState = {
  stripe_customer_id: "cus_test_1" as string | null,
};

interface RecipientRow {
  email: string;
  last_name: string | null;
  first_name: string | null;
  client_profiles: { display_name: string | null } | { display_name: string | null }[] | null;
}
const adminRecipientState = {
  row: {
    email: "user1@test.local",
    last_name: "田中",
    first_name: "太郎",
    client_profiles: null,
  } as RecipientRow | null,
};

const adminUpdates: Array<{ table: string; payload: unknown; eqArgs: unknown[] }> = [];
const adminRpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (..._args: unknown[]) => {
          if (table === "users") {
            return {
              single: async () => ({
                data: { stripe_customer_id: adminUserState.stripe_customer_id },
                error: null,
              }),
              // A5: upgradePlanAction のメール受信者取得は maybeSingle を使う
              maybeSingle: async () => ({
                data: adminRecipientState.row,
                error: null,
              }),
            };
          }
          return {
            in: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: subState.row,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
      insert: (payload: unknown) => {
        adminInserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: unknown) => ({
        eq: async (...args: unknown[]) => {
          adminUpdates.push({ table, payload, eqArgs: args });
          return { error: null };
        },
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      adminRpcCalls.push({ fn, args });
      return { error: null };
    },
  }),
}));

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}
const sendEmailMock = vi.fn(
  async (_params: SendEmailParams) => ({ success: true as const }),
);
vi.mock("@/lib/email/send-email", () => ({
  sendEmail: (params: SendEmailParams) => sendEmailMock(params),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => stripeMock,
}));

vi.mock("@/lib/billing/validate-downgrade", () => ({
  validateDowngradePrerequisites: validateMock,
}));

const {
  changePlanAction,
  cancelDowngradeReservationAction,
  scheduleCancelAction,
  cancelImmediatelyAction,
  cancelCompensationAction,
  openCustomerPortalAction,
} = await import("@/app/(authenticated)/billing/plan-actions");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.STRIPE_PRICE_INDIVIDUAL = "price_individual";
  process.env.STRIPE_PRICE_SMALL = "price_small";
  process.env.STRIPE_PRICE_CORPORATE = "price_corporate";
  process.env.STRIPE_PRICE_CORPORATE_PREMIUM = "price_corporate_premium";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.STRIPE_PORTAL_CONFIGURATION_ID = "bpc_test";

  authState.user = { id: "user-1" };
  authState.userRow = { role: "client" };
  subState.row = {
    id: "sub-row-1",
    user_id: "user-1",
    plan_type: "individual",
    status: "active",
    stripe_subscription_id: "sub_1",
    schedule_id: null,
    cancel_at_period_end: false,
    current_period_end: "2026-05-01T00:00:00Z",
  };
  adminInserts.length = 0;
  adminUpdates.length = 0;
  adminRpcCalls.length = 0;
  adminRecipientState.row = {
    email: "user1@test.local",
    last_name: "田中",
    first_name: "太郎",
    client_profiles: null,
  };
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue({ success: true as const });
  validateMock.mockResolvedValue({ ok: true } as ValidationResult);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---- changePlanAction ----

describe("changePlanAction", () => {
  it("routes to upgrade when target > current", async () => {
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.performedType).toBe("upgrade");
      expect(result.data?.newPlanName).toBe("小規模事業主様向けプラン");
    }
    expect(stripeMock.subscriptions.update).toHaveBeenCalledOnce();
    // Webhook race 回避のため subscriptions.plan_type を同期的に先行 UPDATE している
    const planTypeUpdate = adminUpdates.find(
      (u) =>
        u.table === "subscriptions" &&
        (u.payload as { plan_type?: string }).plan_type === "small",
    );
    expect(planTypeUpdate).toBeDefined();
    // 法人プラン以外なので ensure_organization_exists は呼ばれない
    expect(
      adminRpcCalls.find((r) => r.fn === "ensure_organization_exists"),
    ).toBeUndefined();
  });

  it("法人プランへのアップグレード時に ensure_organization_exists RPC を同期的に呼ぶ", async () => {
    const result = await changePlanAction({ targetPlan: "corporate" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.performedType).toBe("upgrade");
    }
    // subscriptions.plan_type 先行 UPDATE
    const planTypeUpdate = adminUpdates.find(
      (u) =>
        u.table === "subscriptions" &&
        (u.payload as { plan_type?: string }).plan_type === "corporate",
    );
    expect(planTypeUpdate).toBeDefined();
    // ensure_organization_exists 先行 RPC（Webhook 到達前にクライアントが
    // /mypage/client-profile/edit?setup=true へ遷移してもガードを通れるようにするため）
    const ensureOrgCall = adminRpcCalls.find(
      (r) => r.fn === "ensure_organization_exists",
    );
    expect(ensureOrgCall).toBeDefined();
    expect((ensureOrgCall!.args as { uid: string }).uid).toBe("user-1");
  });

  it("法人高サポートプランへのアップグレード時も ensure_organization_exists を呼ぶ", async () => {
    const result = await changePlanAction({ targetPlan: "corporate_premium" });
    expect(result.success).toBe(true);
    const ensureOrgCall = adminRpcCalls.find(
      (r) => r.fn === "ensure_organization_exists",
    );
    expect(ensureOrgCall).toBeDefined();
  });

  it("routes to downgrade when target < current", async () => {
    subState.row!.plan_type = "corporate";
    const result = await changePlanAction({ targetPlan: "individual" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.performedType).toBe("downgrade");
    }
    expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalledOnce();
  });

  it("returns error on same plan", async () => {
    const result = await changePlanAction({ targetPlan: "individual" });
    expect(result).toEqual({
      success: false,
      error: "同じプランへの変更はできません",
    });
  });

  it("returns error when past_due", async () => {
    subState.row!.status = "past_due";
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result.success).toBe(false);
  });

  it("returns error when a reservation is active (schedule_id)", async () => {
    subState.row!.schedule_id = "sub_sched_999";
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result).toEqual({
      success: false,
      error: "予約をキャンセルしてからプラン変更してください",
    });
  });

  it("returns error when cancel_at_period_end is true", async () => {
    subState.row!.cancel_at_period_end = true;
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result).toEqual({
      success: false,
      error: "予約をキャンセルしてからプラン変更してください",
    });
  });

  it("returns error when staff role", async () => {
    authState.userRow = { role: "staff" };
    const result = await changePlanAction({ targetPlan: "small" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("担当者");
    }
  });

  it("returns validation errors on downgrade prerequisites failure", async () => {
    subState.row!.plan_type = "corporate";
    validateMock.mockResolvedValueOnce({
      ok: false as const,
      errors: ["掲載中の案件を1件以下にしてください"],
    });
    const result = await changePlanAction({ targetPlan: "individual" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("掲載中の案件");
    }
  });

  // ---- A5: プラン変更完了メール（upgrade-immediate） ----
  //
  // Webhook 側の差分判定は先行 UPDATE により「差分なし」となりメール送信を skip する。
  // このため upgradePlanAction 自身が同期送信する必要がある（案 A / 案 B 非採用）。
  //
  // 参考: `修正指示書_テスト前修正まとめ.md` A5 節、`A5_upgrade_email_briefing.md`
  //
  it("A5: アップグレード時に「【ビジ友】プラン変更を承りました」メールを Server Action から送信する", async () => {
    const result = await changePlanAction({ targetPlan: "corporate" });
    expect(result.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe("user1@test.local");
    expect(call.subject).toBe("【ビジ友】プラン変更を承りました");
    // 姓名スペースなし結合 + 旧プラン + 新プランがテンプレに埋め込まれる
    expect(call.html).toContain("田中太郎");
    expect(call.html).toContain("個人発注者様向けプラン");
    expect(call.html).toContain("法人向けプラン");
  });

  it("A5: 受信者名は client_profiles.display_name を優先する", async () => {
    adminRecipientState.row = {
      email: "biz@test.local",
      last_name: "田中",
      first_name: "太郎",
      client_profiles: { display_name: "鈴木工務店株式会社" },
    };
    await changePlanAction({ targetPlan: "corporate" });
    const call = sendEmailMock.mock.calls[0]![0] as { html: string; to: string };
    expect(call.to).toBe("biz@test.local");
    expect(call.html).toContain("鈴木工務店株式会社 様");
    expect(call.html).not.toContain("田中太郎 様");
  });

  it("A5: display_name が空文字なら姓名フォールバック", async () => {
    adminRecipientState.row = {
      email: "user2@test.local",
      last_name: "山田",
      first_name: "花子",
      client_profiles: { display_name: "   " }, // trim すると空
    };
    await changePlanAction({ targetPlan: "corporate" });
    const call = sendEmailMock.mock.calls[0]![0] as { html: string };
    expect(call.html).toContain("山田花子 様");
  });

  it("A5: client_profiles が配列でも先頭を採用する（Supabase nested select 挙動）", async () => {
    adminRecipientState.row = {
      email: "user3@test.local",
      last_name: "田中",
      first_name: "太郎",
      client_profiles: [{ display_name: "配列プロフィール株式会社" }],
    };
    await changePlanAction({ targetPlan: "corporate" });
    const call = sendEmailMock.mock.calls[0]![0] as { html: string };
    expect(call.html).toContain("配列プロフィール株式会社 様");
  });

  it("A5: ダウングレードでは A5 のアップグレード完了メールを送らない", async () => {
    subState.row!.plan_type = "corporate";
    await changePlanAction({ targetPlan: "individual" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("A5: 同プラン・エラー系ではメール送信されない", async () => {
    // schedule_id あり → 予約チェックで弾かれる
    subState.row!.schedule_id = "sub_sched_999";
    await changePlanAction({ targetPlan: "corporate" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("A5: メール送信が例外を投げても Server Action は成功を返す（fire-and-forget）", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const result = await changePlanAction({ targetPlan: "corporate" });
    expect(result.success).toBe(true);
  });

  it("A5: 受信者行が取れない場合はメール送信を skip する", async () => {
    adminRecipientState.row = null;
    const result = await changePlanAction({ targetPlan: "corporate" });
    expect(result.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ---- A5-follow-up: 予約系メール（cancel-reserved / reservation-removed-*） ----
//
// scheduleCancelAction / cancelDowngradeReservationAction にも A5 と同構造の
// 「先行 UPDATE で Webhook diff が消える」問題があり、Server Action 自身が
// メールを送る必要がある。Webhook (c) / (d-1) / (d-2) 分岐は fallback。

describe("scheduleCancelAction (A5-follow-up: cancel-reserved メール)", () => {
  it("解約予約成功時に「【ビジ友】解約をご予約いただきました」メールを送信する", async () => {
    subState.row!.plan_type = "corporate";
    subState.row!.current_period_end = "2026-08-15T00:00:00Z";

    const result = await scheduleCancelAction();
    expect(result.success).toBe(true);

    // Stripe API 呼ばれた
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: true,
    });
    // 先行 UPDATE が入った
    const preUpdate = adminUpdates.find(
      (u) =>
        u.table === "subscriptions" &&
        (u.payload as { cancel_at_period_end?: boolean }).cancel_at_period_end === true,
    );
    expect(preUpdate).toBeDefined();

    // メール送信
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.to).toBe("user1@test.local");
    expect(call.subject).toBe("【ビジ友】解約をご予約いただきました");
    expect(call.html).toContain("田中太郎 様");
    expect(call.html).toContain("ビジ友の解約をご予約いただきました");
    // endDate = formatDate("2026-08-15T00:00:00Z") = "2026/08/15"
    expect(call.html).toContain("2026/08/15");
    expect(call.html).toContain("有料プランでのご利用が終了します");
  });

  it("DB / Stripe 応答ともに終了日が無ければ endDate は「—」で送信される", async () => {
    subState.row!.current_period_end = null;
    // 既定の update mock は {} を返す（item/top どちらにも期間なし）
    await scheduleCancelAction();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.html).toContain("— をもって");
  });

  it("DB が null でも Stripe 応答の current_period_end を優先し、実日付で送信・先行保存する", async () => {
    // 契約直後・Webhook 未達で DB の終了日が空のケースを再現
    subState.row!.current_period_end = null;
    const periodEndUnix = Math.floor(
      Date.parse("2026-09-30T00:00:00Z") / 1000,
    );
    stripeMock.subscriptions.update.mockResolvedValueOnce({
      id: "sub_1",
      items: { data: [{ current_period_end: periodEndUnix }] },
      cancel_at_period_end: true,
    });

    const result = await scheduleCancelAction();
    expect(result.success).toBe(true);

    // メールは「—」ではなく実日付（2026-09-30T00:00:00Z → JST 2026/09/30）
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.html).toContain("2026/09/30");
    expect(call.html).not.toContain("— をもって");

    // 画面が Webhook を待たず正しく表示できるよう、DB 先行 UPDATE にも
    // current_period_end が入る
    const preUpdate = adminUpdates.find(
      (u) =>
        u.table === "subscriptions" &&
        (u.payload as { current_period_end?: string }).current_period_end !=
          null,
    );
    expect(preUpdate).toBeDefined();
    expect(
      (preUpdate!.payload as { current_period_end?: string })
        .current_period_end,
    ).toBe("2026-09-30T00:00:00.000Z");
  });

  it("past_due 時は Stripe 呼ばず、メールも送らない", async () => {
    subState.row!.status = "past_due";
    const result = await scheduleCancelAction();
    expect(result.success).toBe(false);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("validateDowngradePrerequisites が NG なら Stripe 呼ばずメールも送らない", async () => {
    validateMock.mockResolvedValueOnce({
      ok: false as const,
      errors: ["未完了の案件があります"],
    });
    const result = await scheduleCancelAction();
    expect(result.success).toBe(false);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("メール送信が例外を投げても Server Action は成功を返す", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const result = await scheduleCancelAction();
    expect(result.success).toBe(true);
  });
});

describe("cancelDowngradeReservationAction (A5-follow-up: reservation-removed-* メール)", () => {
  it("ダウングレード予約取消時に「【ビジ友】ご予約を取り消しました」（プラン変更予約取消）メールを送信する", async () => {
    subState.row!.plan_type = "corporate";
    subState.row!.schedule_id = "sub_sched_existing";
    // Stripe API はまだ Schedule を持っている状態を返す
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_corporate" } }] },
      schedule: "sub_sched_existing",
      cancel_at_period_end: false,
    });

    const result = await cancelDowngradeReservationAction();
    expect(result.success).toBe(true);
    expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith(
      "sub_sched_existing",
    );

    // メール送信
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.subject).toBe("【ビジ友】ご予約を取り消しました");
    expect(call.html).toContain("田中太郎 様");
    expect(call.html).toContain("先日ご予約いただいたプラン変更を取り消しました");
    // planName = 現プラン（corporate）
    expect(call.html).toContain("法人向けプラン");
  });

  it("解約予約取消時に「【ビジ友】ご予約を取り消しました」（解約予約取消）メールを送信する", async () => {
    subState.row!.plan_type = "individual";
    subState.row!.cancel_at_period_end = true;
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_individual" } }] },
      schedule: null,
      cancel_at_period_end: true,
    });

    const result = await cancelDowngradeReservationAction();
    expect(result.success).toBe(true);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: false,
    });

    // メール送信
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.subject).toBe("【ビジ友】ご予約を取り消しました");
    expect(call.html).toContain("先日ご予約いただいた解約を取り消しました");
    // planName = 現プラン（individual）
    expect(call.html).toContain("個人発注者様向けプラン");
    expect(call.html).toContain("今後も引き続き");
  });

  it("予約が何もない状態（idempotent path）ではメール送信しない", async () => {
    // subState は schedule_id: null / cancel_at_period_end: false（デフォルト）
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_individual" } }] },
      schedule: null,
      cancel_at_period_end: false,
    });

    const result = await cancelDowngradeReservationAction();
    expect(result.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("メール送信が例外を投げても Server Action は成功を返す", async () => {
    subState.row!.plan_type = "corporate";
    subState.row!.schedule_id = "sub_sched_existing";
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_corporate" } }] },
      schedule: "sub_sched_existing",
      cancel_at_period_end: false,
    });
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));

    const result = await cancelDowngradeReservationAction();
    expect(result.success).toBe(true);
  });
});

// ---- cancelImmediatelyAction ----

describe("cancelImmediatelyAction", () => {
  it("succeeds when past_due", async () => {
    subState.row!.status = "past_due";
    const result = await cancelImmediatelyAction();
    expect(result.success).toBe(true);
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
  });

  it("rejects when NOT past_due", async () => {
    subState.row!.status = "active";
    const result = await cancelImmediatelyAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("お支払い遅延中の場合のみ");
    }
  });
});

// ---- openCustomerPortalAction ----

describe("openCustomerPortalAction", () => {
  it("returns portal URL when user has stripe_customer_id", async () => {
    adminUserState.stripe_customer_id = "cus_test_1";
    const result = await openCustomerPortalAction();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.portalUrl).toBe(
        "https://billing.stripe.com/test",
      );
    }
  });

  it("returns error when user has no stripe_customer_id", async () => {
    adminUserState.stripe_customer_id = null;
    const result = await openCustomerPortalAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("お支払い情報が登録されていません");
    }
  });

  it("rejects staff role", async () => {
    authState.userRow = { role: "staff" };
    const result = await openCustomerPortalAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("担当者アカウント");
    }
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

// ---- cancelCompensationAction ----

describe("cancelCompensationAction", () => {
  it("rejects staff role before touching Stripe", async () => {
    authState.userRow = { role: "staff" };
    const result = await cancelCompensationAction({
      optionSubscriptionId: "opt-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("担当者アカウント");
    }
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
