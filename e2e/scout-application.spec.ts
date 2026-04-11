import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT } from "./helpers";

// ---------------------------------------------------------------------------
// Seed data UUIDs (see seed.sql section 14)
// ---------------------------------------------------------------------------
const SCOUT_MESSAGE_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const SCOUT_APPLICATION_ID = "dddddddd-dddd-dddd-dddd-dddddddddd01";
const SCOUT_JOB_ID = "88888888-8888-8888-8888-888888888899";
// Normal application (no scout) — seed section 12
const NORMAL_APPLICATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
// Open job for apply form test (matches contractor's trade_type + area, not yet applied)
const OPEN_JOB_ID = "88888888-8888-8888-8888-888888888898";

// ---------------------------------------------------------------------------
// 受注者: 応募履歴でのスカウト経由バッジ表示
// ---------------------------------------------------------------------------
test.describe("受注者: スカウト経由応募のバッジ表示", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("応募履歴一覧（CON-011）でスカウト経由バッジが表示される", async ({
    page,
  }) => {
    await page.goto("/applications/history");
    await expect(
      page.getByRole("heading", { name: "応募履歴" }),
    ).toBeVisible();

    // The scout application card should have the badge
    const scoutCard = page
      .locator(`a[href*="${SCOUT_APPLICATION_ID}"]`)
      .first()
      .locator("..");
    // Look for the badge text anywhere in the card's parent
    const badgeOnPage = page.getByText("スカウト経由").first();
    await expect(badgeOnPage).toBeVisible();
  });

  test("応募詳細（CON-012）でスカウト経由バッジが表示される", async ({
    page,
  }) => {
    await page.goto(`/applications/history/${SCOUT_APPLICATION_ID}`);
    await expect(
      page.getByRole("heading", { name: "応募詳細" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由")).toBeVisible();
  });

  test("通常の応募詳細（CON-012）にはスカウト経由バッジが表示されない", async ({
    page,
  }) => {
    await page.goto(`/applications/history/${NORMAL_APPLICATION_ID}`);
    await expect(
      page.getByRole("heading", { name: "応募詳細" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 発注者: 応募管理でのスカウト経由バッジ表示
// ---------------------------------------------------------------------------
test.describe("発注者: スカウト経由応募のバッジ表示", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("応募一覧（CLI-007）でスカウト経由バッジが表示される", async ({
    page,
  }) => {
    await page.goto("/applications/received");
    await expect(
      page.getByRole("heading", { name: "応募一覧" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由").first()).toBeVisible();
  });

  test("応募詳細（CLI-008）でスカウト経由バッジが表示される", async ({
    page,
  }) => {
    await page.goto(`/applications/received/${SCOUT_APPLICATION_ID}`);
    await expect(
      page.getByRole("heading", { name: "応募詳細" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 受注者: 応募フォームでのスカウト経由表示
// ---------------------------------------------------------------------------
test.describe("受注者: 応募フォームのスカウト経由表示", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("スカウト経由の応募フォームに「スカウト経由の応募です」テキストが表示される", async ({
    page,
  }) => {
    await page.goto(
      `/jobs/${OPEN_JOB_ID}/apply?scout_message_id=${SCOUT_MESSAGE_ID}`,
    );
    await expect(page.getByText("スカウト経由の応募です")).toBeVisible();
  });

  test("通常の応募フォームには「スカウト経由の応募です」テキストが表示されない", async ({
    page,
  }) => {
    await page.goto(`/jobs/${OPEN_JOB_ID}/apply`);
    await expect(page.getByText("スカウト経由の応募です")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 受注者: 二重応募の防止
// ---------------------------------------------------------------------------
test.describe("受注者: スカウト経由でも二重応募は防止される", () => {
  test("既にスカウト経由で応募済みの案件に再度応募するとエラーになる", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    // Try to apply again to the same job (already applied via scout in seed)
    await page.goto(`/jobs/${SCOUT_JOB_ID}/apply`);
    await expect(page.getByText("応募情報入力")).toBeVisible();

    // Fill the form
    await page.locator("input[type='number']").fill("1");
    await page
      .locator("input[placeholder='日程/働き方を入力']")
      .fill("常勤");
    await page.locator("input[type='date']").fill("2026-05-01");
    await page.getByLabel("上記内容を確認しました").check();
    await page.getByRole("button", { name: "応募する" }).click();

    // Confirm dialog
    await page.getByRole("button", { name: "OK" }).click();

    // Should show error toast about duplicate application
    await expect(
      page.getByText("この案件には既に応募済みです"),
    ).toBeVisible({ timeout: 10000 });
  });
});
