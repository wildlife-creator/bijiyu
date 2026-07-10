import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT } from "./helpers";

// contractor(11111111) は seed のスカウト案件 88888888-...899 に応募済み
const CONTRACTOR_ID = "11111111-1111-1111-1111-111111111111";
// 修正2: 応募送信時に受諾確定する pending スカウト（seed section 14b）
const PENDING_SCOUT_THREAD = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee06";
const PENDING_SCOUT_JOB = "88888888-8888-8888-8888-888888888897";

// ---------------------------------------------------------------------------
// Seed data UUIDs (see seed.sql section 14)
// ---------------------------------------------------------------------------
const SCOUT_MESSAGE_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const SCOUT_APPLICATION_ID = "dddddddd-dddd-dddd-dddd-dddddddddd01";
// CLI-010 は applied を除外するため、accepted 状態のスカウト応募を別途用意
const SCOUT_APPLICATION_ACCEPTED_ID = "dddddddd-dddd-dddd-dddd-dddddddddd02";
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

  test("発注履歴一覧（CLI-010）でスカウト経由バッジが表示される（accepted 状態）", async ({
    page,
  }) => {
    // CLI-010 は applied を除外するため、accepted 状態のスカウト応募で検証
    await page.goto("/applications/orders");
    await expect(
      page.getByRole("heading", { name: "発注履歴一覧" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由").first()).toBeVisible();
  });

  test("発注履歴詳細（CLI-011）でスカウト経由バッジが表示される", async ({
    page,
  }) => {
    await page.goto(`/applications/orders/${SCOUT_APPLICATION_ACCEPTED_ID}`);
    await expect(
      page.getByRole("heading", { name: "発注内容詳細" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由")).toBeVisible();
  });

  test("通常の発注履歴詳細（CLI-011）にはスカウト経由バッジが表示されない", async ({
    page,
  }) => {
    await page.goto(`/applications/orders/${NORMAL_APPLICATION_ID}`);
    await expect(
      page.getByRole("heading", { name: "発注内容詳細" }),
    ).toBeVisible();
    await expect(page.getByText("スカウト経由")).not.toBeVisible();
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

// ---------------------------------------------------------------------------
// 修正1: 応募済みの職人には同一案件のスカウトを送れない（送信画面で選択不可）
// ---------------------------------------------------------------------------
test.describe("発注者: 応募済み案件はスカウト送信画面で選択不可", () => {
  test("応募済みの職人には応募済み案件が『（応募済み）』で無効化される", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    // contractor(11111111) は client の案件 ...899 に応募済み
    await page.goto(`/messages/scout-send?userId=${CONTRACTOR_ID}`);
    await expect(
      page.getByRole("heading", { name: "スカウト送信" }),
    ).toBeVisible({ timeout: 10000 });

    // 案件プルダウンを開く
    await page
      .locator("label", { hasText: "募集する案件を選択" })
      .locator("..")
      .getByRole("combobox")
      .click();

    // 応募済み案件は「（応募済み）」表示かつ選択不可（disabled）
    const appliedOption = page.getByRole("option", { name: /（応募済み）/ });
    await expect(appliedOption.first()).toBeVisible({ timeout: 10000 });
    await expect(appliedOption.first()).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

// ---------------------------------------------------------------------------
// 修正2: スカウト受諾は「応募送信成功時」に確定する（クリック時点では pending）
// ---------------------------------------------------------------------------
test.describe("受注者: スカウト受諾の確定タイミングは応募送信時", () => {
  test("受ける→離脱では受諾されず、応募送信後にのみ受諾済みになる", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);

    // pending スカウトのスレッドを開く → 「受ける」ボタンが出る
    await page.goto(`/messages/${PENDING_SCOUT_THREAD}`);
    const acceptBtn = page.getByRole("button", { name: "スカウトを受ける" });
    await expect(acceptBtn).toBeVisible({ timeout: 10000 });

    // 「受ける」→ 応募入力画面へ遷移（この時点では受諾は確定しない）
    await acceptBtn.click();
    await page.waitForURL(new RegExp(`/jobs/${PENDING_SCOUT_JOB}/apply`), {
      timeout: 10000,
    });
    await expect(page.getByText("スカウト経由の応募です")).toBeVisible();

    // 応募せず離脱してスレッドに戻る → まだ pending（再度「受ける」から入れる）
    await page.goto(`/messages/${PENDING_SCOUT_THREAD}`);
    await expect(
      page.getByRole("button", { name: "スカウトを受ける" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("スカウトを受けました")).toHaveCount(0);

    // もう一度「受ける」→ 今度は応募を送信する
    await page.getByRole("button", { name: "スカウトを受ける" }).click();
    await page.waitForURL(new RegExp(`/jobs/${PENDING_SCOUT_JOB}/apply`), {
      timeout: 10000,
    });
    await page.locator("input[type='number']").fill("1");
    await page.locator("input[placeholder='日程/働き方を入力']").fill("常勤");
    await page.locator("input[type='date']").fill("2026-06-01");
    await page.getByLabel("上記内容を確認しました").check();
    await page.getByRole("button", { name: "応募する" }).click();
    // 確認ダイアログ OK → 送信
    await page.getByRole("button", { name: "OK" }).click();
    // 完了ダイアログ
    await expect(page.getByText("応募が完了しました。")).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "OK" }).click();

    // スレッドに戻ると受諾済みになり、「受ける」ボタンは消える
    await page.goto(`/messages/${PENDING_SCOUT_THREAD}`);
    await expect(page.getByText("スカウトを受けました")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: "スカウトを受ける" }),
    ).toHaveCount(0);
  });
});
