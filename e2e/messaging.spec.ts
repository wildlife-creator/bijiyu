import { test, expect } from "@playwright/test";
import {
  login,
  TEST_CONTRACTOR,
  TEST_CONTRACTOR2,
  TEST_CLIENT,
  TEST_STAFF,
  TEST_INDIVIDUAL_CLIENT,
} from "./helpers";

// ---------------------------------------------------------------------------
// Seed data UUIDs (see seed.sql)
// ---------------------------------------------------------------------------
const SCOUT_THREAD_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01";
const MSG_THREAD_ORG_CON2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02";
const MSG_THREAD_ORG_CON3 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03";
const MSG_THREAD_INDIV_CON = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05";

// Target user for scout send
const CONTRACTOR2_ID = "cc111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// 受注者: メッセージ一覧（CON-008）
// ---------------------------------------------------------------------------
test.describe("受注者: メッセージ一覧（CON-008）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("メッセージ一覧ページが表示される", async ({ page }) => {
    await page.goto("/messages");
    await expect(
      page.getByRole("heading", { name: "メッセージ" }),
    ).toBeVisible();
  });

  test("スレッドが一覧に表示される", async ({ page }) => {
    await page.goto("/messages");
    // contractor has threads: scout thread with 鈴木工務店, message thread with 中村リフォーム
    await expect(page.getByText("鈴木工務店")).toBeVisible({ timeout: 10000 });
  });

  test("タブ切り替え — メッセージタブ", async ({ page }) => {
    await page.goto("/messages");
    // タブリンク: "メッセージ" がタブ内に複数存在しうるので href で特定
    await page.locator("a[href='/messages?type=message']").click();
    await page.waitForURL(/type=message/);
    // 中村リフォーム（個人発注者・屋号あり）とのメッセージスレッドが表示される
    await expect(page.getByText("中村リフォーム")).toBeVisible({
      timeout: 10000,
    });
  });

  test("タブ切り替え — スカウトタブ", async ({ page }) => {
    await page.goto("/messages");
    await page.locator("a[href='/messages?type=scout']").click();
    await page.waitForURL(/type=scout/);
    // スカウトスレッドが表示される（鈴木工務店株式会社）
    await expect(page.getByText("鈴木工務店株式会社")).toBeVisible({ timeout: 10000 });
  });

  test("一斉送信ボタンが受注者には表示されない", async ({ page }) => {
    await page.goto("/messages");
    await expect(page.getByRole("link", { name: "一斉送信" })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 受注者: メッセージ詳細・送信（CON-009/010）
// ---------------------------------------------------------------------------
test.describe("受注者: メッセージ詳細・送信（CON-009/010）", () => {
  test("メッセージ詳細ページが表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/messages/${SCOUT_THREAD_ID}`);
    // ヘッダーに相手の名前が表示される
    await expect(page.getByText("鈴木工務店")).toBeVisible({ timeout: 10000 });
  });

  test("メッセージを送信できる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/messages/${MSG_THREAD_INDIV_CON}`);
    await expect(page.getByText("中村リフォーム")).toBeVisible({
      timeout: 10000,
    });

    // メッセージを入力して送信（送信ボタンはアイコンのみ）
    const messageText = `E2Eテストメッセージ ${Date.now()}`;
    const input = page.locator("textarea[placeholder='メッセージ']");
    await input.fill(messageText);
    // 送信ボタンは丸い Send アイコンボタン（size="icon" の最後のボタン）
    await page.locator("button.rounded-full.bg-primary").last().click();

    // 送信したメッセージが画面に表示される（楽観的UIで即時反映）
    await expect(page.getByText(messageText)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者: メッセージ一覧（CON-008 — 発注者視点）
// ---------------------------------------------------------------------------
test.describe("発注者: メッセージ一覧（CON-008）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("メッセージ一覧に一斉送信ボタンが表示される", async ({ page }) => {
    await page.goto("/messages");
    await expect(
      page.getByRole("heading", { name: "メッセージ" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "一斉送信" })).toBeVisible();
  });

  test("複数の受注者とのスレッドが表示される", async ({ page }) => {
    await page.goto("/messages");
    // 受注者2〜4 とのスレッドが見える（屋号ありは屋号表示、なしは個人名表示）
    await expect(page.getByText("高橋美咲")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("渡辺電設")).toBeVisible();
    await expect(page.getByText("小林さくら")).toBeVisible();
  });

  test("スレッドをクリックするとメッセージ詳細に遷移する", async ({
    page,
  }) => {
    await page.goto("/messages");
    await page.getByText("高橋美咲").click();
    await page.waitForURL(/\/messages\//);
    // メッセージ本文が表示される
    await expect(
      page.getByText("先日はお疲れ様でした"),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者: 一斉送信（CLI-014）
// ---------------------------------------------------------------------------
test.describe("発注者: 一斉送信（CLI-014）", () => {
  test("一斉送信画面が表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/messages/bulk-send");
    await expect(
      page.getByRole("heading", { name: "一斉送信" }),
    ).toBeVisible();
    // 送信先選択ラベルが表示される
    await expect(page.getByText("送信先選択")).toBeVisible();
  });

  test("全選択ボタンで全受注者を選択できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/messages/bulk-send");
    await expect(page.getByText("送信先選択")).toBeVisible({ timeout: 10000 });

    // 「全選択」をクリック
    await page.getByRole("button", { name: "全選択" }).click();

    // 全チェックボックスが checked になる
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }

    // 「全解除」に切り替わる
    await expect(page.getByRole("button", { name: "全解除" })).toBeVisible();
  });

  test("一斉送信を実行できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/messages/bulk-send");
    await expect(page.getByText("送信先選択")).toBeVisible({ timeout: 10000 });

    // 全選択
    await page.getByRole("button", { name: "全選択" }).click();

    // 本文を入力
    await page
      .getByPlaceholder("ここに本文が入ります。")
      .fill("一斉送信テストメッセージです。");

    // 送信
    await page.getByRole("button", { name: "送信する" }).click();

    // 成功メッセージ
    await expect(page.getByText("名に送信しました")).toBeVisible({
      timeout: 15000,
    });
  });
});

// ---------------------------------------------------------------------------
// 発注者: スカウト送信（CLI-015）
// ---------------------------------------------------------------------------
test.describe("発注者: スカウト送信（CLI-015）", () => {
  test("スカウト送信画面が表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/messages/scout-send?userId=${CONTRACTOR2_ID}`);
    await expect(
      page.getByRole("heading", { name: "スカウト送信" }),
    ).toBeVisible();
    // 対象ユーザーの名前が表示される
    await expect(page.getByText("高橋")).toBeVisible();
    await expect(page.getByText("美咲")).toBeVisible();
  });

  test("必須項目が未入力だとエラーが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/messages/scout-send?userId=${CONTRACTOR2_ID}`);
    await expect(
      page.getByRole("heading", { name: "スカウト送信" }),
    ).toBeVisible();

    // 何も入力せず送信
    await page.getByRole("button", { name: "送信する" }).click();
    // エラートーストが表示される
    await expect(page.getByText("案件を選択してください")).toBeVisible({
      timeout: 5000,
    });
  });

  test("スカウトを送信できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/messages/scout-send?userId=${CONTRACTOR2_ID}`);
    await expect(
      page.getByRole("heading", { name: "スカウト送信" }),
    ).toBeVisible();

    // 案件を選択
    await page
      .locator("label", { hasText: "募集する案件を選択" })
      .locator("..")
      .getByRole("combobox")
      .click();
    // 最初の案件を選択
    await page.getByRole("option").first().click();

    // タイトルと本文を入力
    await page
      .getByPlaceholder("ここにタイトルが入ります。")
      .fill("スカウトテスト");
    await page
      .getByPlaceholder("ここに本文が入ります。")
      .fill("E2Eテストからのスカウトメッセージです。");

    // 送信（router.back() で前の画面に遷移する）
    await page.getByRole("button", { name: "送信する" }).click();

    // 送信成功後に前の画面に遷移する（スカウト送信画面を離れる）
    await expect(page.getByRole("heading", { name: "スカウト送信" })).not.toBeVisible({
      timeout: 15000,
    });
  });
});

// ---------------------------------------------------------------------------
// 担当者: 組織スレッド共有閲覧
// ---------------------------------------------------------------------------
test.describe("担当者: 組織スレッド共有閲覧", () => {
  test("担当者がメッセージ一覧で組織のスレッドを閲覧できる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/messages");
    await expect(
      page.getByRole("heading", { name: "メッセージ" }),
    ).toBeVisible();

    // 鈴木工務店の組織スレッドが見える（受注者2〜4とのスレッド、屋号ありは屋号表示）
    await expect(page.getByText("高橋美咲")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("渡辺電設")).toBeVisible();
  });

  test("担当者が組織スレッドの詳細を閲覧できる", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/messages/${MSG_THREAD_ORG_CON2}`);
    // スレッドの相手名とメッセージ内容が表示される
    await expect(page.getByText("高橋美咲")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("先日はお疲れ様でした"),
    ).toBeVisible();
  });

  test("担当者にも一斉送信ボタンが表示される", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/messages");
    await expect(
      page.getByRole("link", { name: "一斉送信", exact: true }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 個人発注者: メッセージ（組織なし）
// ---------------------------------------------------------------------------
test.describe("個人発注者: メッセージ", () => {
  test("個人発注者のメッセージ一覧が表示される", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/messages");
    await expect(
      page.getByRole("heading", { name: "メッセージ" }),
    ).toBeVisible();
    // 田中建設（屋号あり）とのスレッドが表示される
    await expect(page.getByText("田中建設")).toBeVisible({ timeout: 10000 });
  });

  test("個人発注者がメッセージ詳細を閲覧できる", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto(`/messages/${MSG_THREAD_INDIV_CON}`);
    await expect(page.getByText("田中建設")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("キッチンリフォーム"),
    ).toBeVisible();
  });
});
