import { test, expect } from "@playwright/test";
import { login, TEST_CLIENT } from "./helpers";

test.describe("案件掲載機能（CLI-001〜004）", () => {
  test.beforeEach(async ({ page }) => {
    // Login as client user
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("募集現場一覧ページが表示される（CLI-001）", async ({ page }) => {
    await page.goto("/jobs/manage");
    await expect(
      page.getByRole("heading", { name: "募集現場一覧" })
    ).toBeVisible();
    await expect(page.getByText("新規作成")).toBeVisible();
  });

  test("新規登録フォームが表示される（CLI-004）", async ({ page }) => {
    await page.goto("/jobs/create");
    await expect(
      page.getByRole("heading", { name: "募集現場新規登録" })
    ).toBeVisible();
    await expect(page.getByText("タイトル 必須")).toBeVisible();
    await expect(page.getByText("職種 必須")).toBeVisible();
  });

  test("案件を下書き保存できる", async ({ page }) => {
    await page.goto("/jobs/create");

    // Fill required fields
    await page.getByPlaceholder("案件タイトルを入力").fill("E2Eテスト案件");
    await page.getByPlaceholder("請負案件の詳細を入力").fill("E2Eテストの案件詳細説明です。");

    // Reward (upper first, then lower in the form)
    await page.getByPlaceholder("上限").fill("20000");
    await page.getByPlaceholder("下限").fill("15000");

    // Select area (エリア)
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole("option", { name: "東京都" }).click();

    // Select trade type (募集職種)
    await page.locator('[data-slot="select-trigger"]').nth(1).click();
    await page.getByRole("option", { name: "大工", exact: true }).click();

    // Headcount
    await page.getByPlaceholder("人数").fill("2");

    // Dates
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
    const format = (d: Date) => d.toISOString().split("T")[0];

    await page.locator('input[type="date"]').nth(0).fill(format(nextMonth));
    await page.locator('input[type="date"]').nth(1).fill(format(endMonth));
    await page.locator('input[type="date"]').nth(2).fill(format(today));
    await page.locator('input[type="date"]').nth(3).fill(format(nextMonth));

    // Save as draft
    await page.getByRole("button", { name: "下書き保存" }).click();

    // Should redirect to detail page (with ?manage=true)
    await page.waitForURL(/\/jobs\/[a-f0-9-]+/);
    await expect(page.getByText("E2Eテスト案件")).toBeVisible();
  });

  test("案件詳細画面に編集ボタンがある（CLI-002）", async ({ page }) => {
    // Use the seed data job (66666666-6666-6666-6666-666666666666)
    // CLI-002 is accessed via ?manage=true (from CLI-001)
    await page.goto("/jobs/66666666-6666-6666-6666-666666666666?manage=true");
    await expect(
      page.getByRole("heading", { name: "募集現場詳細" })
    ).toBeVisible();
    await expect(page.getByText("編集する").first()).toBeVisible();
  });

  test("バリデーションエラーが表示される", async ({ page }) => {
    await page.goto("/jobs/create");

    // Submit without filling required fields
    await page.getByRole("button", { name: "公開する" }).click();

    // Should show validation error toast
    await expect(
      page.getByText("入力内容に不備があります")
    ).toBeVisible();
  });
});
