import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT } from "./helpers";

test.describe("ログイン画面（AUTH-001）", () => {
  test("メールアドレスとパスワードでログインできる", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/mypage/);
  });

  test("存在しないメールアドレスでエラーが表示される", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill("nonexistent@test.local");
    await page.getByLabel("パスワード").fill("testpass123");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(
      page.getByText("メールアドレスまたはパスワードが正しくありません"),
    ).toBeVisible();
  });

  test("パスワードを間違えるとエラーが表示される", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(TEST_CONTRACTOR.email);
    await page.getByLabel("パスワード").fill("wrongpassword");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(
      page.getByText("メールアドレスまたはパスワードが正しくありません"),
    ).toBeVisible();
  });

  test("未入力のままログインボタンを押すとバリデーションエラー", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(
      page.getByText("メールアドレスを入力してください"),
    ).toBeVisible();
    await expect(
      page.getByText("パスワードを入力してください"),
    ).toBeVisible();
  });
});

test.describe("新規登録画面（AUTH-002〜003）", () => {
  test("新規登録フォームが表示される", async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "会員登録メール認証" }),
    ).toBeVisible();
  });
});

test.describe("パスワードリセット（AUTH-004〜005）", () => {
  test("パスワードリセットメール送信フォームが表示される", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: "パスワード再設定依頼" }),
    ).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
  });

  test("メール送信後に完了メッセージが表示される", async ({ page }) => {
    await page.goto("/reset-password");
    await page.getByLabel("メールアドレス").fill(TEST_CONTRACTOR.email);
    await page.getByRole("button", { name: /送信/ }).click();
    await expect(
      page.getByText("リセットメールを送信しました"),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("退会画面（AUTH-006〜007）", () => {
  test("退会画面が表示される", async ({ page }) => {
    await login(page);
    await page.goto("/profile/withdrawal");
    await expect(
      page.getByRole("heading", { name: "退会手続き" }),
    ).toBeVisible();
  });
});

test.describe("ハンバーガーメニュー（認証状態別）", () => {
  const CLIENT_ONLY_ITEMS = [
    "募集現場一覧",
    "応募者一覧",
    "発注履歴一覧",
    "発注者情報詳細",
  ];

  test("contractorには発注者メニューが表示されない", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/mypage");
    await page.getByRole("button", { name: "メニュー" }).click();

    const drawer = page.getByRole("dialog");

    // 受注者メニューは表示される
    await expect(drawer.getByText("募集案件一覧")).toBeVisible();
    await expect(drawer.getByText("プロフィール")).toBeVisible();

    // 発注者メニューは非表示
    for (const label of CLIENT_ONLY_ITEMS) {
      await expect(drawer.getByText(label)).not.toBeVisible();
    }
  });

  test("clientには発注者メニューが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage");
    await page.getByRole("button", { name: "メニュー" }).click();

    const drawer = page.getByRole("dialog");

    // 受注者メニューも表示される
    await expect(drawer.getByText("募集案件一覧")).toBeVisible();

    // 発注者メニューも表示される
    for (const label of CLIENT_ONLY_ITEMS) {
      await expect(drawer.getByText(label)).toBeVisible();
    }
  });
});
