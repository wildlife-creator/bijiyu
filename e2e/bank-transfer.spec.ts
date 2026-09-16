import { test, expect, type Page } from "@playwright/test";

import { TEST_ADMIN, login } from "./helpers";

/**
 * 銀行振込（P12 / docs/requirements/p12-bank-transfer-onoff-implementation-notes.md）の E2E。
 *
 * ユーザーストーリー:
 *  1. 会員がログインしてお問い合わせを開くと会員情報が入っている → 「お支払い方法（銀行振込）について」
 *     + 希望プランを選んで送信できる
 *  2. 運営が ADM-002 → 銀行振込お問い合わせ一覧 → 行の「ユーザー詳細」→ 「銀行振込」枠で有効にする
 *     → 会員の /billing が「ご利用中」+「お支払い方法: 銀行振込」。Stripe 前提のボタン（解約・お支払い情報）は
 *     出ず、カード払いへの切り替えボタンは押せる
 *  3. 未ログインのお問い合わせでは銀行振込の選択肢が出ない
 *  4. 銀行振込で契約中の発注者（seed）を、発注者詳細で「変更する」「無効にする」できる
 *     （無効化すると受注者に戻るため、発注者詳細からユーザー詳細へ移る）
 *
 * 前提 seed（supabase/seed.sql「銀行振込 テストデータ」。`supabase db reset` 直後に実行）:
 *  - bank-transfer-e2e@test.local: 無料の受注者（本テストで client になる。他テストは使わない）
 *  - bank-requested@test.local  : 銀行振込のお問い合わせ（希望: ライトプラン）を送信済み
 *  - bank-client@test.local     : スタンダードを銀行振込で契約中（振込商店）
 */

const TEST_BANK_E2E = { email: "bank-transfer-e2e@test.local", password: "testpass123" };

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(TEST_ADMIN.email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/admin\/dashboard/);
}

async function pickSelect(page: Page, triggerId: string, optionName: string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

test.describe.serial("銀行振込: お問い合わせ → 一覧 → ユーザー詳細で有効化 → 会員側（P12）", () => {
  test("1. 会員がログインしてお問い合わせ（銀行振込・希望プラン）を送る。会員情報が最初から入っている", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/contact");

    // ログイン中は会員情報が初期入力される（電話番号は会員情報に無いので空）
    await expect(page.locator("#name")).toHaveValue("振込一郎");
    await expect(page.locator("#email")).toHaveValue(TEST_BANK_E2E.email);
    await expect(page.locator("#address")).toHaveValue("東京都");
    await expect(page.locator("#phone")).toHaveValue("");

    await page.locator("#companyName").fill("振込一郎建設");
    await page.locator("#phone").fill("03-0000-1111");
    await pickSelect(page, "purpose", "仕事を依頼したい");
    await pickSelect(page, "industry", "大工");
    await pickSelect(page, "inquiryType", "お支払い方法（銀行振込）について");
    // 銀行振込を選ぶと希望プランが出る
    await pickSelect(page, "bankTransferPlan", "スタンダードプラン");
    await page.locator("#detail").fill("スタンダードプランを銀行振込で契約したいです。");
    await page.getByRole("button", { name: "送信する" }).click();
    await expect(page.getByText("お問い合わせを受け付けました。")).toBeVisible();
  });

  test("2. 運営が銀行振込お問い合わせ一覧 → ユーザー詳細 → 「有効にする」", async ({ page }) => {
    await adminLogin(page);

    // ダッシュボード → 銀行振込お問い合わせ一覧（クリック導線）
    await page.getByRole("link", { name: "銀行振込お問い合わせ一覧" }).click();
    await page.waitForURL(/\/admin\/bank-transfers/);
    await expect(page.getByRole("heading", { name: "銀行振込お問い合わせ一覧" })).toBeVisible();

    // seed の問い合わせ（振込次郎 / ライト）とテスト 1 の問い合わせ（振込一郎 / スタンダード）が並ぶ
    await expect(page.getByText("希望：ライトプラン")).toBeVisible();
    const row = page.getByText(TEST_BANK_E2E.email).locator("..");
    await expect(row).toContainText("振込一郎");
    await expect(row).toContainText("希望：スタンダードプラン");
    // まだ発注者ではないので「ユーザー詳細」（ADM-009）へ
    await row.getByRole("link", { name: "ユーザー詳細" }).click();
    await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "ユーザーアカウント詳細" })).toBeVisible();

    // 銀行振込枠: プランを選んで有効にする
    await pickSelect(page, "bt-plan", "スタンダードプラン");
    await page.getByRole("button", { name: "有効にする", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "銀行振込でプランを有効にしますか？" });
    await dialog.getByRole("button", { name: "有効にする" }).click();
    await expect(page.getByText("スタンダードプランを有効にしました")).toBeVisible();
    // 受注者だった人が発注者になったので、発注者詳細への導線が出る
    await expect(page.getByRole("link", { name: "発注者詳細を開く" })).toBeVisible();
    // 契約中の表示に切り替わる（変更する / 無効にする）
    await expect(page.getByText("現在: スタンダードプラン（銀行振込）")).toBeVisible();
    await expect(page.getByRole("button", { name: "無効にする" })).toBeVisible();
  });

  test("3. 会員の /billing は「ご利用中」+ 銀行振込表示。Stripe 前提のボタンは出ず、カード払いへの切り替えは押せる", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/billing");
    await expect(page.getByText("ご利用中", { exact: true })).toBeVisible();
    await expect(page.getByText(/お支払い方法: 銀行振込/)).toBeVisible();
    await expect(page.getByText(/運営までご連絡ください/)).toBeVisible();
    await expect(page.getByRole("button", { name: "解約する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "お支払い情報を管理する" })).toHaveCount(0);
    // カード払いへの切り替え: 現在のプランは「カード払いに切り替える」、他のプランは「カード払いで申し込む」
    await expect(page.getByRole("button", { name: /カード払いに切り替える/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /カード払いで申し込む/ }).first()).toBeEnabled();
    // 旧 本人申込ボタンは無く、お問い合わせへの案内が出る
    await expect(page.getByRole("button", { name: "銀行振込で申し込む" })).toHaveCount(0);
    await expect(page.getByText(/銀行振込をご希望の方は/).first()).toBeVisible();
  });
});

test.describe("銀行振込: 未ログインのお問い合わせ", () => {
  test("未ログインでは「お支払い方法（銀行振込）について」を選べない", async ({ page }) => {
    await page.goto("/contact");
    await page.locator("#inquiryType").click();
    await expect(page.getByRole("option", { name: "料金について", exact: true })).toBeVisible();
    await expect(
      page.getByRole("option", { name: "お支払い方法（銀行振込）について", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("#bankTransferPlan")).toHaveCount(0);
  });
});

test.describe.serial("銀行振込: 契約中の発注者を「変更する」「無効にする」", () => {
  test("発注者詳細（ADM-004）でプランを変更できる", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clients?q=bank-client");
    const row = page.getByRole("link", { name: /振込商店/ });
    await expect(row).toContainText("プラン: スタンダード（銀行振込）");
    await row.click();
    await page.waitForURL(/\/admin\/clients\//);

    await expect(page.getByText("現在: スタンダードプラン（銀行振込）")).toBeVisible();
    await pickSelect(page, "bt-plan", "プレミアムプラン");
    await page.getByRole("button", { name: "変更する", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "プランを変更しますか？" });
    await dialog.getByRole("button", { name: "変更する" }).click();
    await expect(page.getByText("プレミアムプランに変更しました")).toBeVisible();
    await expect(page.getByText("現在: プレミアムプラン（銀行振込）")).toBeVisible();
    // 銀行振込は月払い / 年払い・有効期限を持たない
    await expect(page.getByText(/プラン: プレミアム（銀行振込）/)).toBeVisible();
    await expect(page.getByText(/期限間近|期限切れ|期限を延長する/)).toHaveCount(0);
  });

  test("発注者詳細（ADM-004）で無効にすると、受注者に戻るのでユーザー詳細（ADM-009）へ移り、有効化の枠に戻る", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clients?q=bank-client");
    await page.getByRole("link", { name: /振込商店/ }).click();
    await page.waitForURL(/\/admin\/clients\//);

    await expect(page.getByText("現在: プレミアムプラン（銀行振込）")).toBeVisible();
    await page.getByRole("button", { name: "無効にする" }).click();
    const dialog = page.getByRole("alertdialog", { name: "銀行振込の契約を無効にしますか？" });
    await dialog.getByRole("button", { name: "無効にする" }).click();
    await expect(page.getByText("無効にしました")).toBeVisible();
    // 無効化で発注者ではなくなる（ADM-004 は開けない）ため、ユーザー詳細へ移る
    await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "ユーザーアカウント詳細" })).toBeVisible();
    // 有料プランなし → 「有効にする」が出る
    await expect(page.getByRole("button", { name: "有効にする", exact: true })).toBeVisible();
    await expect(page.getByText(/現在: .*（銀行振込）/)).toHaveCount(0);
  });
});
