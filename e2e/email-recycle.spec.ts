import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers";

/**
 * email-recycle-on-delete spec / Task 11
 *
 * 「削除 → 同メール再利用」の中核回帰を 3 シナリオで検証する:
 *   11.1 代理 staff 削除 → 同メールで別法人代理に招待 → 成功
 *   11.2 通常 staff 削除 → 同メールで再招待 → 成功
 *   11.3 受注者本人退会 → 同 email の auth.users が解放されていることを SQL で確認
 *
 * 設計判断:
 *   - 各テストは seed の独立した user pair を使う (互いに mutate しない)
 *   - 「再利用成功」の検証は UI 上の成功トーストで判定 (再招待の admin invite が
 *      auth.users UNIQUE で詰まらず受理されることを確認)
 *   - 11.3 の full re-register UI 通しは `auth-signup.spec.ts` でカバー済の signup
 *     フローと重複するため、本テストでは「auth.users.email が印付き化されて
 *      元 email が空いている」DB 状態のみ検証
 */

const TEST_FIXTURES = {
  password: "testpass123",
  // 11.1: クロス法人での代理 → 同メール別法人再招待
  aOwner: {
    email: "er-a-owner@test.local",
    userId: "ee110011-1111-4111-8111-111111111111",
    orgId: "ee110aa1-aaaa-4aaa-8aaa-111111111111",
    displayName: "メール再利用 法人 A",
  },
  bOwner: {
    email: "er-b-owner@test.local",
    userId: "ee110022-2222-4222-8222-222222222222",
    orgId: "ee110aa2-aaaa-4aaa-8aaa-222222222222",
    displayName: "メール再利用 法人 B",
  },
  proxyTarget: {
    email: "er-proxy-target@test.local",
    userId: "ee110099-9999-4999-8999-111111111111",
    lastName: "リサイクル",
    firstName: "代理対象",
  },
  // 11.2: 同法人での通常 staff 再招待
  cOwner: {
    email: "er-c-owner@test.local",
    userId: "ee220011-1111-4111-8111-111111111111",
    orgId: "ee220aa1-aaaa-4aaa-8aaa-111111111111",
  },
  staffTarget: {
    email: "er-staff-target@test.local",
    userId: "ee220099-9999-4999-8999-111111111111",
    lastName: "リサイクル",
    firstName: "通常対象",
  },
  // 11.3: 受注者本人退会
  dContractor: {
    email: "er-self-withdraw@test.local",
    userId: "ee330011-1111-4111-8111-111111111111",
  },
} as const;

const SUFFIX_PATTERN = /^deleted-\d{8}-[a-z0-9]{4,}-/;

/**
 * service_role 経由で auth.users.email を直接読み取る。
 * 印付け書き換えの検証用 (admin REST API 経由)。
 */
async function readAuthEmail(
  request: APIRequestContext,
  userId: string,
): Promise<string | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 未設定");
  const resp = await request.get(
    `http://127.0.0.1:54321/auth/v1/admin/users/${userId}`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { email?: string };
  return body.email ?? null;
}

// ===========================================================================
// 11.1: 代理 staff 削除 → 別法人で同メール再招待
// ===========================================================================
test.describe("Task 11.1: 代理 staff 削除 → 別法人で同メール再招待", () => {
  test("ER-A Owner が代理を削除 → email 印付け化 → ER-B Owner が同 email で再招待成功", async ({
    page,
    request,
  }) => {
    // Step 1: ER-A Owner で代理を削除
    await login(page, TEST_FIXTURES.aOwner.email, TEST_FIXTURES.password);
    await page.goto(`/mypage/members/${TEST_FIXTURES.proxyTarget.userId}`);
    await expect(
      page.getByRole("heading", { name: "担当者詳細" }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "削除する" }).click();

    await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 10000 });
    await expect(page.getByText("担当者を削除しました")).toBeVisible();

    // Step 2: auth.users.email が印付き化されたことを SQL で確認
    const recycledEmail = await readAuthEmail(
      request,
      TEST_FIXTURES.proxyTarget.userId,
    );
    expect(recycledEmail).not.toBeNull();
    expect(recycledEmail).toMatch(SUFFIX_PATTERN);
    expect(recycledEmail).toContain(TEST_FIXTURES.proxyTarget.email);

    // Step 3: ER-B Owner で同 email を別法人代理として再招待
    await page.context().clearCookies();
    await login(page, TEST_FIXTURES.bOwner.email, TEST_FIXTURES.password);
    await page.goto("/mypage/members/new");
    await expect(
      page.getByRole("heading", { name: "担当者新規作成" }),
    ).toBeVisible();
    await page.getByPlaceholder("田中").fill(TEST_FIXTURES.proxyTarget.lastName);
    await page
      .getByPlaceholder("一郎")
      .fill(TEST_FIXTURES.proxyTarget.firstName);
    await page
      .getByPlaceholder("test@example.com")
      .fill(TEST_FIXTURES.proxyTarget.email);
    await page.getByRole("checkbox", { name: "代理アカウント" }).check();
    await page
      .getByRole("button", { name: "入力内容を確認する" })
      .click();
    await expect(page.getByText("名前").first()).toBeVisible();
    await page.getByRole("button", { name: "送信する" }).click();

    // Step 4: 招待成功 (旧来は auth.users UNIQUE で詰まっていた回帰)
    await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 10000 });
    await expect(page.getByText(/招待しました/)).toBeVisible();
  });
});

// ===========================================================================
// 11.2: 通常 staff 削除 → 同法人で同メール再招待
// ===========================================================================
test.describe("Task 11.2: 通常 staff 削除 → 同法人で同メール再招待", () => {
  test("ER-C Owner が staff を削除 → email 印付け化 → 同 Owner が同 email で再招待成功", async ({
    page,
    request,
  }) => {
    // Step 1: ER-C Owner で staff を削除
    await login(page, TEST_FIXTURES.cOwner.email, TEST_FIXTURES.password);
    await page.goto(`/mypage/members/${TEST_FIXTURES.staffTarget.userId}`);
    await expect(
      page.getByRole("heading", { name: "担当者詳細" }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "削除する" }).click();

    await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 10000 });
    await expect(page.getByText("担当者を削除しました")).toBeVisible();

    // Step 2: 印付け化を SQL で確認
    const recycledEmail = await readAuthEmail(
      request,
      TEST_FIXTURES.staffTarget.userId,
    );
    expect(recycledEmail).not.toBeNull();
    expect(recycledEmail).toMatch(SUFFIX_PATTERN);

    // Step 3: 同 Owner が同 email で再招待 (通常 staff = is_proxy_account=false)
    await page.goto("/mypage/members/new");
    await page.getByPlaceholder("田中").fill(TEST_FIXTURES.staffTarget.lastName);
    await page
      .getByPlaceholder("一郎")
      .fill(TEST_FIXTURES.staffTarget.firstName);
    await page
      .getByPlaceholder("test@example.com")
      .fill(TEST_FIXTURES.staffTarget.email);
    // is_proxy_account はチェックしない (通常 staff)
    await page
      .getByRole("button", { name: "入力内容を確認する" })
      .click();
    await expect(page.getByText("名前").first()).toBeVisible();
    await page.getByRole("button", { name: "送信する" }).click();

    await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 10000 });
    await expect(page.getByText(/招待しました/)).toBeVisible();
  });
});

// ===========================================================================
// 11.3: 受注者本人退会 → 同 email の auth.users 解放を SQL で確認
// ===========================================================================
test.describe("Task 11.3: 受注者本人退会 → email 解放", () => {
  test("ER-D Contractor が退会 → auth.users.email が印付き化 (元 email は新規登録に開放される)", async ({
    page,
    request,
  }) => {
    // Step 1: ER-D Contractor でログインして退会画面へ
    await login(page, TEST_FIXTURES.dContractor.email, TEST_FIXTURES.password);
    await page.goto("/profile/withdrawal");
    await expect(
      page.getByRole("heading", { name: "退会手続き" }),
    ).toBeVisible();

    // Step 2: 退会理由を選択 → 同意 → 退会する
    // shadcn Select: Label に htmlFor が無いため SelectTrigger を placeholder text で掴む
    await page.getByText("お選びください").click();
    await page
      .getByRole("option", { name: "仕事の依頼が来なかった" })
      .click();
    await page.getByLabel("上記内容に同意して退会する").check();
    await page.getByRole("button", { name: "退会する" }).click();

    // 退会完了で /login or /goodbye 等へリダイレクト
    await page.waitForURL(/\/(login|goodbye|$)/, { timeout: 15000 });

    // Step 3: auth.users.email が印付き化されていることを SQL で確認
    //         (= 元 email "er-self-withdraw@test.local" は新規登録で再利用可能)
    const recycledEmail = await readAuthEmail(
      request,
      TEST_FIXTURES.dContractor.userId,
    );
    expect(recycledEmail).not.toBeNull();
    expect(recycledEmail).toMatch(SUFFIX_PATTERN);
    expect(recycledEmail).toContain(TEST_FIXTURES.dContractor.email);

    // Step 4: 元 email で実際に supabase.auth.signUp が通ることを実機検証
    //         (2026-06-25 修正で auth.identities も同期するようになり、
    //          以前は signUp が user_already_exists で詰まっていた回帰防止)
    const signUpResp = await request.post(
      "http://127.0.0.1:54321/auth/v1/signup",
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          "Content-Type": "application/json",
        },
        data: {
          email: TEST_FIXTURES.dContractor.email,
          password: "fresh-signup-test-pass",
        },
      },
    );
    const signUpBody = (await signUpResp.json()) as {
      id?: string;
      error_code?: string;
      msg?: string;
    };
    // user_already_exists エラーで詰まらず、新規 user が作られていること
    expect(signUpBody.error_code).toBeUndefined();
    expect(signUpBody.id).toBeTruthy();
  });
});
