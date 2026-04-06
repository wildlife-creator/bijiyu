import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT } from "./helpers";

// ---------------------------------------------------------------------------
// 受注者フロー
// ---------------------------------------------------------------------------
test.describe("受注者: 応募履歴（CON-011〜013）", () => {
  test("応募履歴一覧ページが表示される", async ({ page }) => {
    await login(page);
    await page.goto("/applications/history");
    await expect(page.getByRole("heading", { name: "応募履歴" })).toBeVisible();
  });

  test("応募詳細ページが表示される", async ({ page }) => {
    await login(page);
    await page.goto("/applications/history");
    // Click on the first application card
    await page.locator("a[href*='/applications/history/']").first().click();
    await expect(page.getByRole("heading", { name: "応募詳細" })).toBeVisible();
  });

  test("accepted 状態の応募をキャンセルできる", async ({ page }) => {
    await login(page);
    // Navigate to the applied application
    await page.goto("/applications/history/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    await expect(page.getByRole("heading", { name: "応募詳細" })).toBeVisible();

    // Click cancel button
    await page.getByRole("button", { name: "キャンセルする" }).click();

    // Confirm in dialog
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "キャンセルする" }).click();

    // Should redirect to history page
    await page.waitForURL(/\/applications\/history$/);
  });
});

// ---------------------------------------------------------------------------
// 発注者フロー
// ---------------------------------------------------------------------------
test.describe("発注者: 応募管理（CLI-007〜009）", () => {
  test("応募一覧ページが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/received");
    await expect(page.getByRole("heading", { name: "応募一覧" })).toBeVisible();
  });

  test("発注可否画面で「お断りする」を実行できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    // Navigate to the applied application's decide page
    await page.goto("/applications/received/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc/decide");
    await expect(page.getByRole("heading", { name: "発注可否" })).toBeVisible();

    // Select reject
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "お断りする" }).click();

    // Submit
    await page.getByRole("button", { name: "送信する" }).click();

    // Success dialog
    await expect(page.getByText("ユーザーへ結果を送信しました")).toBeVisible();
    await page.getByRole("button", { name: "OK" }).click();
    await page.waitForURL(/\/applications\/received$/);
  });
});

test.describe("発注者: 発注履歴（CLI-010〜012）", () => {
  test("発注履歴一覧ページが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/orders");
    await expect(page.getByRole("heading", { name: "発注履歴一覧" })).toBeVisible();
  });

  test("発注履歴詳細ページが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/orders");
    // Click first order
    const firstLink = page.locator("a[href*='/applications/orders/']").first();
    await firstLink.waitFor({ state: "visible", timeout: 10000 });
    await firstLink.click();
    await expect(page.getByRole("heading", { name: "発注内容詳細" })).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者評価表示
// ---------------------------------------------------------------------------
test.describe("発注者評価表示（CLI-028）", () => {
  test("発注者評価ページが表示される", async ({ page }) => {
    await login(page);
    // View reviews for the contractor user (user_reviews = 発注者→受注者の評価)
    await page.goto("/users/11111111-1111-1111-1111-111111111111/reviews");
    await expect(page.getByRole("heading", { name: "発注者評価" })).toBeVisible();
  });
});
