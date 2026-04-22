import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT } from "./helpers";

// ---------------------------------------------------------------------------
// Seed data UUIDs
// ---------------------------------------------------------------------------
// 発注可否テスト用（applied 状態）
const APPLICATION_FOR_ACCEPT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbe"; // contractor4 → 千葉案件
// 受注者作業報告テスト用（accepted 状態、レビューなし）
const APPLICATION_FOR_CONTRACTOR_REPORT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab"; // contractor → job2
// 発注者作業報告テスト用（accepted 状態、レビューなし）
const APPLICATION_FOR_CLIENT_REPORT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac"; // contractor3 → 東京マンション

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
// 受注者: ステータスフィルター
// ---------------------------------------------------------------------------
test.describe("受注者: ステータスフィルター（CON-011）", () => {
  test("ステータスで応募履歴を絞り込める", async ({ page }) => {
    await login(page);
    await page.goto("/applications/history");
    await expect(page.getByRole("heading", { name: "応募履歴" })).toBeVisible();

    // フィルターのプルダウンを選択（onValueChange で即時遷移）
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "稼働予定" }).click();

    // URL にフィルターパラメータが付く
    await page.waitForURL(/filter=/, { timeout: 10000 });
    // 検索結果が表示される
    await expect(page.getByText("検索結果")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者: 応募詳細表示（CLI-008）
// ---------------------------------------------------------------------------
test.describe("発注者: 応募詳細（CLI-008）", () => {
  test("応募詳細ページが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/received");
    // 応募カードをクリック
    const firstLink = page.locator("a[href*='/applications/received/']").first();
    await firstLink.waitFor({ state: "visible", timeout: 10000 });
    await firstLink.click();
    await expect(page.getByRole("heading", { name: "応募詳細" })).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者: 発注を依頼する（CLI-009 accept）
// ---------------------------------------------------------------------------
test.describe("発注者: 発注を依頼する（CLI-009）", () => {
  test("「発注を依頼する」を実行できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/received/${APPLICATION_FOR_ACCEPT}/decide`);
    await expect(page.getByRole("heading", { name: "発注可否" })).toBeVisible();

    // 「発注を依頼する」を選択
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "発注を依頼する" }).click();

    // 初回稼働日を入力
    const dateInput = page.locator("input[type='date']");
    await dateInput.waitFor({ state: "visible", timeout: 5000 });
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    const dateStr = futureDate.toISOString().split("T")[0];
    await dateInput.fill(dateStr);

    // 送信
    await page.getByRole("button", { name: "送信する" }).click();

    // 成功ダイアログ
    await expect(page.getByText("ユーザーへ結果を送信しました")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "OK" }).click();
    await page.waitForURL(/\/applications\/received$/);
  });
});

// ---------------------------------------------------------------------------
// 受注者: 作業報告・評価入力（CON-013）
// ---------------------------------------------------------------------------
test.describe("受注者: 作業報告・評価入力（CON-013）", () => {
  test("作業報告・評価を登録できる", async ({ page }) => {
    await login(page);
    await page.goto(`/applications/history/${APPLICATION_FOR_CONTRACTOR_REPORT}/report`);
    await expect(page.getByRole("heading", { name: "作業報告・評価入力" })).toBeVisible();

    // 稼働状況を選択
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "問題なく稼働完了", exact: true }).click();

    // 評価: Good を選択
    await page.getByLabel("Good").click();

    // 送信
    await page.getByRole("button", { name: "作業報告・評価を登録する" }).click();

    // マイページにリダイレクト
    await page.waitForURL(/\/mypage/, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者: 作業完了報告・評価登録（CLI-012）
// ---------------------------------------------------------------------------
test.describe("発注者: 作業完了報告・評価登録（CLI-012）", () => {
  test("評価を登録できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/orders/${APPLICATION_FOR_CLIENT_REPORT}/report`);
    await expect(page.locator("h1", { hasText: "評価入力" })).toBeVisible();

    // 稼働状況を選択
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "問題なく稼働完了", exact: true }).click();

    // 6項目の評価をすべて Good にする（aria-label が "質問文 Good" の形式）
    const goodButtons = page.getByRole("button", { name: /Good/ });
    const count = await goodButtons.count();
    for (let i = 0; i < count; i++) {
      await goodButtons.nth(i).click();
    }

    // 送信
    await page.getByRole("button", { name: "評価を登録する" }).click();

    // 発注履歴一覧にリダイレクト
    await page.waitForURL(/\/applications\/orders$/, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// 発注者: CLI-007 / CLI-010 役割分離の検証
// ---------------------------------------------------------------------------
// CLI-007 は status='applied' のみ、CLI-010 は applied を除外する。
// このルールが DB / UI の両方で守られていることを検証する。
test.describe("発注者: CLI-007/CLI-010 の役割分離", () => {
  test("CLI-007（応募一覧）は未対応メッセージを正しく表示する", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/received");
    await expect(page.getByRole("heading", { name: "応募一覧" })).toBeVisible();
    // applied の応募があるか、または「未対応の応募はありません」が表示される
    const emptyMsg = page.getByText("未対応の応募はありません");
    const cards = page.locator("a[href*='/applications/received/']");
    const hasCards = (await cards.count()) > 0;
    if (!hasCards) {
      await expect(emptyMsg).toBeVisible();
    }
  });

  test("CLI-010（発注履歴一覧）のステータスフィルタに「応募あり（未対応）」が無い", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/orders");
    await expect(page.getByRole("heading", { name: "発注履歴一覧" })).toBeVisible();
    await page.getByRole("combobox").click();
    // 「応募あり（未対応）」は CLI-010 のフィルタから削除済み
    await expect(
      page.getByRole("option", { name: "応募あり（未対応）" }),
    ).toHaveCount(0);
    // 他のカテゴリは存在する
    await expect(page.getByRole("option", { name: "発注済み" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 発注者: 案件応募者一覧（CLI-007B, /jobs/[id]/applicants）
// ---------------------------------------------------------------------------
test.describe("発注者: 案件応募者一覧（CLI-007B）", () => {
  // TEST_CLIENT 所有の案件（applied + accepted の応募あり）
  const JOB_WITH_APPLICATIONS = "66666666-6666-6666-6666-666666666666";

  test("CLI-002 から「応募者をみる」ボタンで遷移できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/jobs/${JOB_WITH_APPLICATIONS}?manage=true`);
    await expect(
      page.getByRole("heading", { name: "募集現場詳細" }),
    ).toBeVisible();
    // 応募者をみるリンクが新画面の URL を指すことを確認
    const link = page.getByRole("link", { name: /応募者をみる/ }).first();
    await expect(link).toHaveAttribute(
      "href",
      `/jobs/${JOB_WITH_APPLICATIONS}/applicants`,
    );
    await link.click();
    await page.waitForURL(
      new RegExp(`/jobs/${JOB_WITH_APPLICATIONS}/applicants`),
      { timeout: 10000 },
    );
    await expect(
      page.getByRole("heading", { name: "案件応募者一覧" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("CLI-007B は applied と accepted の両方を表示する", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/jobs/${JOB_WITH_APPLICATIONS}/applicants`);
    await expect(
      page.getByRole("heading", { name: "案件応募者一覧" }),
    ).toBeVisible();
    // デフォルト（フィルタなし）で全ステータスを含めた検索結果件数が1件以上
    await expect(page.getByText(/検索結果: [1-9]/)).toBeVisible();
  });

  test("CLI-007B のステータスフィルタは「応募あり（未対応）」を含む", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/jobs/${JOB_WITH_APPLICATIONS}/applicants`);
    await page.getByRole("combobox").click();
    await expect(
      page.getByRole("option", { name: "応募あり（未対応）" }),
    ).toBeVisible();
  });

  test("他社ユーザーは CLI-007B に 404 でブロックされる", async ({ page }) => {
    // contractor は client の案件の応募者一覧を見られない
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    const response = await page.goto(
      `/jobs/${JOB_WITH_APPLICATIONS}/applicants`,
    );
    expect(response?.status()).toBe(404);
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
