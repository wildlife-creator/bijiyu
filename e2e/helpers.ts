import { type Page } from "@playwright/test";

export const TEST_CONTRACTOR = {
  email: "contractor@test.local",
  password: "testpass123",
};

export const TEST_CONTRACTOR2 = {
  email: "contractor2@test.local",
  password: "testpass123",
};

export const TEST_CONTRACTOR3 = {
  email: "contractor3@test.local",
  password: "testpass123",
};

export const TEST_CONTRACTOR4 = {
  email: "contractor4@test.local",
  password: "testpass123",
};

export const TEST_CLIENT = {
  email: "client@test.local",
  password: "testpass123",
};

export const TEST_CLIENT2 = {
  email: "client2@test.local",
  password: "testpass123",
};

export const TEST_INDIVIDUAL_CLIENT = {
  email: "individual-client@test.local",
  password: "testpass123",
};

// master-area-multi-select Phase F: メール確認済 + プロフィール未設定の AUTH-006 通し E2E 用
export const TEST_NEW_CONTRACTOR_E2E = {
  email: "new-contractor-e2e@test.local",
  password: "testpass123",
};

export const TEST_STAFF = {
  email: "staff@test.local",
  password: "testpass123",
};

export const TEST_ADMIN = {
  email: "admin@test.local",
  password: "testpass123",
};

export const TEST_STAFF_ADMIN = {
  email: "staff-admin@test.local",
  password: "testpass123",
};

// proxy-account-multi-org-support Phase 3 / Task 3.2:
// N 法人兼任の代理スタッフ。法人 X / Y の両方に代理として在籍。
// Cookie 不在時の既定組織は法人 X（created_at で最古）。
export const TEST_PROXY_MULTI = {
  email: "proxy-multi@test.local",
  password: "testpass123",
  userId: "f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orgX: {
    id: "f777a111-1111-1111-1111-111111111111",
    displayName: "プロキシ法人 X 株式会社",
  },
  orgY: {
    id: "f777b222-2222-2222-2222-222222222222",
    displayName: "プロキシ法人 Y 株式会社",
  },
} as const;

// proxy-account-multi-org-support Phase 8 / Task 8.1〜8.5:
// 各 E2E シナリオに独立した法人ツリーを用意（id 帯 f888...）。
// 既存の proxy-multi（f777...）系には触れない。
// 1 組織 = 1 代理 (organization_members_proxy_unique partial UNIQUE) を守る
// ため、シナリオ別に独立した Org Z1〜Z7 を用意している。
export const TEST_PHASE8 = {
  password: "testpass123",
  // 8.1: Z1 (target home) → Z2 (invite actor)
  z1Owner: {
    email: "phase8-z1-owner@test.local",
    userId: "f8881111-1111-1111-1111-111111111111",
    orgId: "f888a111-1111-1111-1111-111111111111",
    displayName: "Phase8 法人 Z1",
    stripeSubscriptionId: "sub_phase8_z1",
  },
  z2Owner: {
    email: "phase8-z2-owner@test.local",
    userId: "f8882222-2222-2222-2222-222222222222",
    orgId: "f888b222-2222-2222-2222-222222222222",
    displayName: "Phase8 法人 Z2",
    stripeSubscriptionId: "sub_phase8_z2",
  },
  // 8.2: Z3 (will-delete-from) + Z4 (surviving)
  z3Owner: {
    email: "phase8-z3-owner@test.local",
    userId: "f8883333-3333-3333-3333-333333333333",
    orgId: "f888c333-3333-3333-3333-333333333333",
    displayName: "Phase8 法人 Z3",
    stripeSubscriptionId: "sub_phase8_z3",
  },
  z4Owner: {
    email: "phase8-z4-owner@test.local",
    userId: "f8884444-4444-4444-4444-444444444444",
    orgId: "f888d444-4444-4444-4444-444444444444",
    displayName: "Phase8 法人 Z4",
    stripeSubscriptionId: "sub_phase8_z4",
  },
  // 8.3: Z5 (will-cancel) + Z6 (surviving)
  z5Owner: {
    email: "phase8-z5-owner@test.local",
    userId: "f8885555-5555-5555-5555-555555555555",
    orgId: "f888e555-5555-5555-5555-555555555555",
    displayName: "Phase8 法人 Z5",
    stripeSubscriptionId: "sub_phase8_z5",
  },
  z6Owner: {
    email: "phase8-z6-owner@test.local",
    userId: "f8886666-6666-6666-6666-666666666666",
    orgId: "f888f666-6666-6666-6666-666666666666",
    displayName: "Phase8 法人 Z6",
    stripeSubscriptionId: "sub_phase8_z6",
  },
  // 8.5: Z7 (name-mismatch target home)
  z7Owner: {
    email: "phase8-z7-owner@test.local",
    userId: "f8887777-7777-7777-7777-777777777777",
    orgId: "f8889977-7777-7777-7777-777777777777",
    displayName: "Phase8 法人 Z7",
    stripeSubscriptionId: "sub_phase8_z7",
  },
  // 4 代理 target
  // 8.1: Z1 のみ → Z2 owner が招待で reuse path → Z2 にも追加
  reuseTarget: {
    email: "phase8-reuse-target@test.local",
    userId: "f888aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    lastName: "リユース",
    firstName: "対象",
  },
  // 8.2: Z3 + Z4 → Z3 owner が削除 → Z4 だけ残る
  multiKeep: {
    email: "phase8-multi-keep@test.local",
    userId: "f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    lastName: "マルチ",
    firstName: "残存",
  },
  // 8.3: Z5 + Z6 → Z5 解約 → Z6 だけ残る
  cancelKeep: {
    email: "phase8-cancel-keep@test.local",
    userId: "f888cccc-cccc-cccc-cccc-cccccccccccc",
    lastName: "解約",
    firstName: "残存",
  },
  // 8.5: Z7 のみ、本来の氏名「田中 太郎」。Z2 owner が違う氏名で招待 → reject
  nameMismatch: {
    email: "phase8-name-mismatch@test.local",
    userId: "f888dddd-dddd-dddd-dddd-dddddddddddd",
    lastName: "田中",
    firstName: "太郎",
  },
} as const;

/**
 * Service role で Supabase REST API の RPC を呼び出す。
 * Phase 8 / Task 8.3 の Stripe webhook シミュレーション
 * （`handle_subscription_lifecycle_deleted` 直接呼び出し）で使用。
 *
 * SUPABASE_SERVICE_ROLE_KEY は `.env.local` から `playwright.config.ts`
 * 経由で `process.env` にロードされる（dotenv セットアップ）。
 */
export async function invokeServiceRoleRpc(
  request: { post: (url: string, opts: unknown) => Promise<unknown> },
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が未設定です。playwright.config.ts で dotenv を有効にしてください",
    );
  }
  return request.post(
    `http://127.0.0.1:54321/rest/v1/rpc/${fn}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      data: args,
    },
  );
}

export async function login(
  page: Page,
  email: string = TEST_CONTRACTOR.email,
  password: string = TEST_CONTRACTOR.password,
) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/);
}
