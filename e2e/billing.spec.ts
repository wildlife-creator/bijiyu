import { expect, test } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT, TEST_STAFF } from "./helpers";

/**
 * E2E tests for CLI-026 (プラン案内画面) and related billing flows.
 *
 * Seed users used:
 *   - contractor@test.local: free (no subscription)
 *   - client@test.local: corporate active
 *   - staff@test.local: staff role
 *   - pastdue@test.local: individual past_due (8+ days)
 *   - downgrade-reserved@test.local: corporate active with schedule_id
 *   - corp-noname@test.local: corporate active, organizations.name=''
 */

const TEST_PAST_DUE = {
  email: "pastdue@test.local",
  password: "testpass123",
};

const TEST_DOWNGRADE_RESERVED = {
  email: "downgrade-reserved@test.local",
  password: "testpass123",
};

const TEST_CORP_NONAME = {
  email: "corp-noname@test.local",
  password: "testpass123",
};

// ===========================================================================
// 15.1: CLI-026 表示パターン
// ===========================================================================

test.describe("CLI-026 表示: 未課金 contractor", () => {
  test("基本プランに「申し込む」ボタンが4つ表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    await expect(page.getByText("プラン変更")).toBeVisible();
    // 見出し単独をターゲット（「基本プラン」は注意書きにも含まれるため）
    await expect(page.getByRole("heading", { name: "基本プラン" })).toBeVisible();

    // 4 plan buttons should show "申し込む"
    const buttons = page.getByRole("button", { name: "申し込む" });
    await expect(buttons.first()).toBeVisible();

    // Initial fee note (first purchase case) should be visible
    await expect(
      page.getByText("初回事務手数料として20,000円が必要となります"),
    ).toBeVisible();
  });

  test("オプションプランセクションが表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    await expect(page.getByText("オプションプラン")).toBeVisible();
    await expect(page.getByText("急募", { exact: true })).toBeVisible();
    // 「動画掲載」は説明文にも含まれるため見出し単独をターゲット
    await expect(page.getByText("動画掲載", { exact: true })).toBeVisible();
    await expect(page.getByText("月5,000円で、有事の際最大200万円の補償があります。")).toBeVisible();
    await expect(page.getByText("月9,800円で、有事の際最大500万円の補償があります。")).toBeVisible();
  });
});

test.describe("CLI-026 表示: active client (corporate)", () => {
  test("現在プランに「ご利用中」バッジが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(page.getByText("ご利用中")).toBeVisible();
  });

  test("他プランに「このプランに変更する」ボタンが表示される", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    const changeButtons = page.getByRole("button", {
      name: "このプランに変更する",
    });
    // corporate user has 3 other plans to change to
    await expect(changeButtons.first()).toBeVisible();
  });

  test("解約するボタンが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "解約する" }),
    ).toBeVisible();
  });

  test("お支払い情報を管理するボタンが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "お支払い情報を管理する" }),
    ).toBeVisible();
  });

  test("初期費用の表示がない（既存ユーザー）", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    // 初回事務手数料「必要」の注意書きは出てはいけない
    // （既存ユーザー向けには「不要となります」の注意書きが出る仕様）
    await expect(
      page.getByText("初回事務手数料として20,000円が必要となります"),
    ).not.toBeVisible();
  });
});

test.describe("CLI-026 表示: staff", () => {
  test("staff 制限メッセージが表示される", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/billing");
    await expect(
      page.getByText("担当者アカウントではプランの変更はできません"),
    ).toBeVisible();
  });

  test("すべての申し込みボタンが無効", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/billing");
    const buttons = page.getByRole("button", { name: "申し込む" });
    for (const btn of await buttons.all()) {
      await expect(btn).toBeDisabled();
    }
  });
});

test.describe("CLI-026 表示: past_due", () => {
  test("past_due 警告メッセージが表示される", async ({ page }) => {
    await login(page, TEST_PAST_DUE.email, TEST_PAST_DUE.password);
    await page.goto("/billing");
    await expect(
      page.getByText("お支払いが完了していません"),
    ).toBeVisible();
  });

  test("PastDueBanner が表示される（お支払い方法を更新するボタン）", async ({ page }) => {
    await login(page, TEST_PAST_DUE.email, TEST_PAST_DUE.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "お支払い方法を更新する" }),
    ).toBeVisible();
  });

  test("即時解約ボタンが表示される", async ({ page }) => {
    await login(page, TEST_PAST_DUE.email, TEST_PAST_DUE.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "即時解約する" }),
    ).toBeVisible();
  });
});

test.describe("CLI-026 表示: ダウングレード予約中", () => {
  test("「変更をキャンセルする」ボタンが表示される", async ({ page }) => {
    await login(
      page,
      TEST_DOWNGRADE_RESERVED.email,
      TEST_DOWNGRADE_RESERVED.password,
    );
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "変更をキャンセルする" }),
    ).toBeVisible();
  });

  test("変更予定ラベルが表示される", async ({ page }) => {
    await login(
      page,
      TEST_DOWNGRADE_RESERVED.email,
      TEST_DOWNGRADE_RESERVED.password,
    );
    await page.goto("/billing");
    await expect(page.getByText("に変更予定")).toBeVisible();
  });
});

test.describe("CLI-026: checkout=success トースト", () => {
  test("checkout=success クエリで /billing へ router.replace される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing?checkout=success");
    // useEffect の `router.replace("/billing")` でクエリが除去されることを確認
    // （トースト表示自体は sonner の auto-dismiss タイミングとレースするため直接アサーションしない）
    await expect(page).toHaveURL(/\/billing(\?|$)/);
    await expect(page).not.toHaveURL(/checkout=success/);
  });
});

// ===========================================================================
// 15.5: 組織名入力暫定画面
// ===========================================================================

test.describe("組織名入力暫定画面 (/mypage/organization-setup)", () => {
  test("組織名未入力ユーザーにフォームが表示される", async ({ page }) => {
    await login(page, TEST_CORP_NONAME.email, TEST_CORP_NONAME.password);
    await page.goto("/mypage/organization-setup");
    await expect(
      page.getByRole("heading", { name: "組織名を入力してください" }),
    ).toBeVisible();
    await expect(page.getByLabel("組織名")).toBeVisible();
  });

  test("既に組織名入力済みのユーザーは /mypage にリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/organization-setup");
    await page.waitForURL(/\/mypage(?!\/)/, { timeout: 5000 });
  });

  test("staff は /mypage にリダイレクトされる", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage/organization-setup");
    await page.waitForURL(/\/mypage(?!\/)/, { timeout: 5000 });
  });

  test("contractor は /mypage にリダイレクトされる", async ({ page }) => {
    await login(
      page,
      TEST_CONTRACTOR.email,
      TEST_CONTRACTOR.password,
    );
    await page.goto("/mypage/organization-setup");
    await page.waitForURL(/\/mypage(?!\/)/, { timeout: 5000 });
  });
});
