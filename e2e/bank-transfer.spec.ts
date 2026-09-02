import { test, expect, type Page } from "@playwright/test";

import { TEST_ADMIN, login } from "./helpers";

/**
 * 銀行振込（P2 / docs/requirements/spec-changes-202608.md §2.1(1)）の E2E。
 *
 * ユーザーストーリー:
 *  1. 無料の受注者が CLI-026 で「銀行振込で申し込む」→ 月払い/年払いを選んで確定 →
 *     受付トースト + 画面に「受付中」表示、Stripe ボタンが押せなくなる（二重契約防止）
 *  2. 運営が ADM-002 → 銀行振込申込一覧 → 詳細 → 請求書送付済 → 入金確認して有効化
 *     → 状態が「入金確認済」になり、申込者の /billing で「ご利用中」+ 銀行振込表示、
 *     Stripe 前提のボタン（解約・お支払い情報）が出ない
 *  3. 運営が ADM-004（発注者詳細）で銀行振込契約の期限を延長できる。ADM-003 一覧には
 *     期限間近バッジが出る（seed の bank-client@test.local）
 *
 * 前提 seed（supabase/seed.sql 末尾「銀行振込テストデータ」）:
 *  - bank-transfer-e2e@test.local: 無料の受注者（本テストで client になる。他テストは使わない）
 *  - bank-requested@test.local  : ライト（月払い）を申込受付のまま
 *  - bank-client@test.local     : スタンダードを銀行振込で契約中（期限 10 日後 → 期限間近）
 */

const TEST_BANK_E2E = { email: "bank-transfer-e2e@test.local", password: "testpass123" };

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(TEST_ADMIN.email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/admin\/dashboard/);
}

test.describe.serial("銀行振込: 申込 → 運営が有効化 → 契約中表示", () => {
  test("1. 受注者が CLI-026 からライトプランを銀行振込（年払い）で申し込む", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "プラン変更" })).toBeVisible();

    // 基本プランセクションの各プランに「銀行振込で申し込む」が並ぶ（4 プラン。オプション側にも別に並ぶ）
    const planSection = page.locator("section").filter({ hasText: "基本プラン" });
    const bankButtons = planSection.getByRole("button", { name: "銀行振込で申し込む" });
    await expect(bankButtons).toHaveCount(4);

    // ライトプラン行のボタンを押す（1 番目）
    await bankButtons.first().click();
    const dialog = page.getByRole("dialog", { name: "銀行振込で申し込む" });
    await expect(dialog).toBeVisible();

    // 月払い → 年払いへ切替（shadcn Select は 2 段クリック）
    await dialog.getByRole("combobox", { name: "お支払いサイクル" }).click();
    await page.getByRole("option", { name: "年払い" }).click();
    await expect(dialog).toContainText("ライトプラン（年払い）");
    await expect(dialog).toContainText("45,600円（税込）"); // 3,800 × 12
    await expect(dialog).toContainText("初回事務手数料: 20,000円（税込）");
    await expect(dialog).toContainText("請求合計: 65,600円（税込）");

    await dialog.getByRole("button", { name: "この内容で申し込む" }).click();
    await expect(page.getByText(/銀行振込でお申し込みいただきました/)).toBeVisible();

    // 受付中の表示 + Stripe ボタンが無効化される
    await expect(page.getByText("銀行振込でのお申し込みを受付中です")).toBeVisible();
    await expect(page.getByText(/ライトプラン（年払い）（申込受付）/)).toBeVisible();
    // 受付中はサーバー側で buttonAction=none になり、文言は「申し込む」・無効化
    await expect(planSection.getByRole("button", { name: /^申し込む$/ }).first()).toBeDisabled();
    await expect(bankButtons.first()).toBeDisabled();
  });

  test("2. 運営が申込を「請求書送付済」→「入金確認して有効化」し、申込者はご利用中になる", async ({ page }) => {
    await adminLogin(page);

    // ダッシュボード → 銀行振込申込一覧（クリック導線）
    await page.getByRole("link", { name: "銀行振込申込一覧" }).click();
    await page.waitForURL(/\/admin\/bank-transfers/);
    await expect(page.getByRole("heading", { name: "銀行振込申込一覧" })).toBeVisible();

    // 状態フィルタ: 申込受付
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "申込受付" }).click();
    await page.waitForURL(/status=requested/);

    // テスト 1 で作った申込（振込一郎 / ライト年払い）を開く
    const row = page.getByRole("link", { name: /振込一郎[\s\S]*ライトプラン（年払い）/ });
    await expect(row).toBeVisible();
    await row.click();
    await page.waitForURL(/\/admin\/bank-transfers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "銀行振込申込詳細" })).toBeVisible();
    await expect(page.getByText("65,600円（税込）")).toBeVisible();

    // 請求書送付済
    await page.getByRole("button", { name: "請求書を送付済みにする" }).click();
    await page.getByRole("button", { name: "送付済みにする" }).click();
    await expect(page.getByText("請求書送付済みにしました")).toBeVisible();
    await expect(page.getByText("請求書送付済", { exact: true }).first()).toBeVisible();

    // 入金確認 → 有効化（開始日は既定=本日のまま）
    await page.getByRole("button", { name: "入金を確認して有効化する" }).click();
    const dialog = page.getByRole("dialog", { name: "入金を確認して有効化する" });
    await expect(dialog.getByLabel("利用開始日")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await dialog.getByRole("button", { name: "有効化する" }).click();
    await expect(page.getByText(/有効化しました（有効期限/)).toBeVisible();
    await expect(page.getByText("入金確認済", { exact: true }).first()).toBeVisible();
    // 有効化後は操作パネルが消え、アカウント詳細への案内が出る
    await expect(page.getByRole("button", { name: "入金を確認して有効化する" })).toHaveCount(0);
    await expect(page.getByText(/有効化済みです/)).toBeVisible();

    // アカウント詳細（ADM-004）に銀行振込セクションが出る
    await page.getByRole("link", { name: "アカウント詳細を見る" }).click();
    await page.waitForURL(/\/admin\/clients\//);
    await expect(page.getByText(/プラン: ライト（銀行振込・年払い）/)).toBeVisible();
    await expect(page.getByRole("button", { name: /期限を延長する/ })).toBeVisible();
  });

  test("3. 申込者の /billing は「ご利用中」+ 銀行振込表示。Stripe 前提のボタンは出ない", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/billing");
    await expect(page.getByText("ご利用中", { exact: true })).toBeVisible();
    await expect(page.getByText(/お支払い方法: 銀行振込（年払い）/)).toBeVisible();
    await expect(page.getByText(/運営までご連絡ください/)).toBeVisible();
    await expect(page.getByRole("button", { name: "解約する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "お支払い情報を管理する" })).toHaveCount(0);
    // 他プランへの変更ボタンは無効（運営対応）
    await expect(page.getByRole("button", { name: "このプランに変更する" }).first()).toBeDisabled();
  });
});

test.describe.serial("銀行振込: ユーザー撮影プラン（P7）の申込 → 運営が有効化 → 購入済み", () => {
  test("1. 受注者が CLI-026 からユーザー撮影プランを銀行振込で申し込む", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "プラン変更" })).toBeVisible();

    // ユーザー撮影プランの行（見出し + 申込ボタン + 銀行振込ボタン）
    const optionSection = page.locator("section").filter({ hasText: "オプションプラン" });
    // 行 = py-4 の div（見出し span が「ユーザー撮影プラン」のもの）
    const row = optionSection
      .locator("div.py-4")
      .filter({ has: page.getByText("ユーザー撮影プラン", { exact: true }) });
    await expect(row.getByRole("button", { name: "ユーザー撮影プランを申し込む" })).toBeEnabled();
    await row.getByRole("button", { name: "銀行振込で申し込む" }).click();

    const dialog = page.getByRole("dialog", { name: "銀行振込で申し込む" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("ユーザー撮影プラン");
    await expect(dialog).toContainText("20,000円（税込）");
    await dialog.getByRole("button", { name: "この内容で申し込む" }).click();
    await expect(page.getByText(/銀行振込でお申し込みいただきました/)).toBeVisible();

    // 受付中は Stripe ボタンが押せず、銀行振込ボタンは「申込中」の案内に置き換わる
    await expect(row.getByRole("button", { name: "ユーザー撮影プランを申し込む" })).toBeDisabled();
    await expect(row.getByText(/銀行振込で申込中（申込受付）/)).toBeVisible();
    await expect(row.getByRole("button", { name: "銀行振込で申し込む" })).toHaveCount(0);
  });

  test("2. 運営が ADM-026 で有効化すると、申込者の /billing で「購入済み」になる", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/bank-transfers?status=requested");
    const row = page.getByRole("link", { name: /振込一郎[\s\S]*ユーザー撮影プラン/ });
    await expect(row).toBeVisible();
    await row.click();
    await page.waitForURL(/\/admin\/bank-transfers\/[0-9a-f-]{36}$/);
    // 金額と請求合計の 2 か所に出る
    await expect(page.getByText("20,000円（税込）").first()).toBeVisible();

    await page.getByRole("button", { name: "入金を確認して有効化する" }).click();
    const dialog = page.getByRole("dialog", { name: "入金を確認して有効化する" });
    await dialog.getByRole("button", { name: "有効化する" }).click();
    await expect(page.getByText(/有効化しました/)).toBeVisible();
    await expect(page.getByText("入金確認済", { exact: true }).first()).toBeVisible();
  });

  test("3. 申込者の /billing でユーザー撮影プランが「購入済み」になる（再購入可なのでボタンは活性）", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/billing");
    const optionSection = page.locator("section").filter({ hasText: "オプションプラン" });
    const optionRow = optionSection
      .locator("div.py-4")
      .filter({ has: page.getByText("ユーザー撮影プラン", { exact: true }) });
    await expect(optionRow.getByRole("button", { name: "購入済み" })).toBeEnabled();
    // 有効化後は銀行振込ボタンが再び出る（申込中の案内は消える）
    await expect(optionRow.getByRole("button", { name: "銀行振込で申し込む" })).toBeEnabled();
  });
});

test.describe("銀行振込: 管理画面の期限表示と延長", () => {
  test("ADM-003 に期限間近バッジ、ADM-004 で期限延長すると期限が 1 か月延びる", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clients?q=bank-client");
    const row = page.getByRole("link", { name: /振込商店/ });
    await expect(row).toContainText("プラン: スタンダード（銀行振込）");
    await expect(row).toContainText("期限間近");

    await row.click();
    await page.waitForURL(/\/admin\/clients\//);
    // 操作パネルの期限表示（<p>）。トースト文言「有効期限を … まで延長しました」と区別する
    const periodEndText = page.locator("p", { hasText: /^有効期限 \d{4}\/\d{2}\/\d{2}/ });
    const before = await periodEndText.textContent();
    await page.getByRole("button", { name: /期限を延長する/ }).click();
    await page.getByRole("button", { name: "延長する" }).click();
    await expect(page.getByText(/有効期限を .* まで延長しました/)).toBeVisible();
    await expect(periodEndText).not.toHaveText(before ?? "");
    // 期限間近バッジが消える（10 日後 + 1 か月 = 40 日後）
    await expect(page.getByText("期限間近")).toHaveCount(0);
  });

  test("ADM-026: 申込受付のままの申込（bank-requested）を取り消せる", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/bank-transfers?status=requested");
    const row = page.getByRole("link", { name: /振込次郎/ });
    await expect(row).toBeVisible();
    await row.click();
    await page.getByRole("button", { name: "申込を取り消す" }).click();
    const dialog = page.getByRole("dialog", { name: "申込を取り消しますか？" });
    await dialog.getByLabel(/取消理由/).fill("E2E: 取消テスト");
    await dialog.getByRole("button", { name: "取り消す" }).click();
    await expect(page.getByText("申込を取り消しました")).toBeVisible();
    await expect(page.getByText("取消", { exact: true }).first()).toBeVisible();
    // 取消理由は運営メモ（テキストエリアの値）に追記される
    await expect(page.getByPlaceholder(/請求書番号/)).toHaveValue(/【取消理由】E2E: 取消テスト/);
  });
});
