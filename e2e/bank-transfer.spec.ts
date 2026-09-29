import { test, expect, type Page } from "@playwright/test";

import { TEST_ADMIN, TEST_CLIENT, login } from "./helpers";

/**
 * 銀行振込（docs/requirements/current-spec.md「銀行振込」）の E2E。
 *
 * ユーザーストーリー:
 *  1. 会員がログインしてお問い合わせを開くと会員情報が入っている → 種類「銀行振込について」を選ぶと
 *     「問い合わせ詳細」の下に「希望のプラン・オプションの名前を書いてください」の案内が出る
 *     （希望プランの選択欄・チェック欄は無い）。詳細に希望を書いて送信できる
 *  2. 運営が ADM-002 → 銀行振込お問い合わせ一覧 → 行の「お問い合わせ詳細」で「送信時のログインアカウント」と
 *     問い合わせ詳細（希望）を確認 → ユーザーアカウント一覧で検索して開く → ユーザー詳細の「契約内容」枠で
 *     「手動設定」で有効にする（お問い合わせ一覧・詳細からユーザー詳細への直リンクは置かない = 取り違え防止）
 *     → 会員の /billing が「ご利用中」。お支払い方法の行は出ず（カード払いだけ表示）、Stripe 前提のボタン
 *     （解約・お支払い情報）も出ない。カード払いへの切り替えボタンは押せる
 *  3. 未ログインのお問い合わせでは銀行振込の選択肢が出ない
 *  4. 手動設定で契約中の発注者（seed）を、ユーザー詳細で「変更する」「無効にする」できる
 *     （契約は会員に紐づくため、枠はユーザー詳細だけ。発注者詳細には枠が無く、
 *     プランと「（手動設定）」の表示だけが残る）
 *  5. 同じ枠で動画プランを「購入済みにする」（購入記録が 1 行ずつ増える）、急募オプションを案件を選んで
 *     「急募を有効にする」（適用中の一覧に「〜まで（手動設定）」が増え、募集案件一覧で「急募」タグが付き、
 *     プルダウンからその案件が消える）
 *  6. カード払いの会員のユーザー詳細は「（クレジットカード…）」のまま、ボタンは「手動設定に切り替える」
 *
 * 前提 seed（supabase/seed.sql「銀行振込 テストデータ」。`supabase db reset` 直後に実行）:
 *  - bank-transfer-e2e@test.local: 無料の受注者（本テストで client になる。他テストは使わない）
 *  - bank-requested@test.local  : 銀行振込のお問い合わせ（詳細に「ライトプラン」と記入）を送信済み
 *  - bank-client@test.local     : スタンダードを手動設定で契約中（振込商店）。掲載中の案件
 *                                 「【振込商店】外壁塗装の職人募集（銀行振込 急募E2E）」を 1 件持つ
 */

const TEST_BANK_E2E = { email: "bank-transfer-e2e@test.local", password: "testpass123" };
/** 種類で銀行振込を選んだときに問い合わせ詳細の下に出る案内の書き出し */
const BANK_TRANSFER_GUIDE_START = /^ご希望の基本プラン・オプションの名前をお書きください/;
const BANK_E2E_DETAIL = "スタンダードプラン 月払いを希望します。「外壁塗装の職人募集」を急募にしたいです。";

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

test.describe.serial("銀行振込: お問い合わせ → 一覧 → ユーザー詳細で有効化 → 会員側", () => {
  test("1. 会員がログインしてお問い合わせ（銀行振込について）を送る。希望は問い合わせ詳細に書く", async ({ page }) => {
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

    // 旧種類名は選択肢に無い
    await page.locator("#inquiryType").click();
    await expect(
      page.getByRole("option", { name: "お支払い方法（銀行振込）について", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // 選ぶ前は案内が出ない
    await expect(page.getByText(BANK_TRANSFER_GUIDE_START)).toHaveCount(0);
    await pickSelect(page, "inquiryType", "銀行振込について");
    // 問い合わせ詳細の下に案内が出る。希望プランの選択欄・チェック欄は無い
    await expect(page.getByText(BANK_TRANSFER_GUIDE_START)).toBeVisible();
    await expect(page.locator("#bankTransferPlan")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "急募オプション" })).toHaveCount(0);

    await page.locator("#detail").fill(BANK_E2E_DETAIL);
    await page.getByRole("button", { name: "送信する" }).click();
    await expect(page.getByText("お問い合わせを受け付けました。")).toBeVisible();
  });

  test("2. 運営が銀行振込お問い合わせ一覧 → お問い合わせ詳細 → ユーザー詳細 → 「有効にする」", async ({ page }) => {
    await adminLogin(page);

    // ダッシュボード → 銀行振込お問い合わせ一覧（クリック導線）
    await page.getByRole("link", { name: "銀行振込お問い合わせ一覧" }).click();
    await page.waitForURL(/\/admin\/bank-transfers/);
    await expect(page.getByRole("heading", { name: "銀行振込お問い合わせ一覧" })).toBeVisible();

    // 説明文は「契約内容」枠を案内する（入金には触れない）。一覧には希望を出さない（問い合わせ詳細で読む）
    await expect(page.getByText(/ユーザーアカウント詳細の「契約内容」から設定してください/)).toBeVisible();
    await expect(page.getByText(/^希望：/)).toHaveCount(0);
    // seed の問い合わせ（振込次郎）とテスト 1 の問い合わせ（振込一郎）が並ぶ
    await expect(page.getByText("bank-requested@test.local")).toBeVisible();
    const row = page.getByText(TEST_BANK_E2E.email).locator("..");
    await expect(row).toContainText("振込一郎");
    // 行のリンクは「お問い合わせ詳細」だけ（ユーザー詳細・発注者詳細への直リンクは置かない）
    await expect(row.getByRole("link")).toHaveCount(1);
    await row.getByRole("link", { name: "お問い合わせ詳細" }).click();
    await page.waitForURL(/\/admin\/contacts\/[0-9a-f-]{36}/);
    // お問い合わせ詳細: 送信時のログインアカウントを文字で確認できる（フォームのメールと同じなので注意書きは出ない）。
    // ユーザー詳細への直リンクは無い
    await expect(page.getByText(`送信時のログインアカウント：${TEST_BANK_E2E.email}`)).toBeVisible();
    await expect(page.getByText("※ フォームのメールアドレスと異なります")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "送信ユーザーの詳細を見る" })).toHaveCount(0);
    // 種類は新しい名前。希望は問い合わせ詳細に書かれている（「希望プラン」の行は無い）
    await expect(page.getByText("銀行振込について", { exact: true })).toBeVisible();
    await expect(page.getByText(BANK_E2E_DETAIL)).toBeVisible();
    await expect(page.getByText("希望プラン", { exact: true })).toHaveCount(0);

    // 運営が自分でユーザーアカウント一覧から検索して開く
    await page.goto(`/admin/users?q=${encodeURIComponent(TEST_BANK_E2E.email)}`);
    await page.getByRole("link", { name: new RegExp(TEST_BANK_E2E.email.replace(/\./g, "\\.")) }).click();
    await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "ユーザーアカウント詳細" })).toBeVisible();

    // 「契約内容」枠: プランを選んで手動設定で有効にする（入金の確認は求めない = 無料提供にも使う）
    await expect(page.getByRole("heading", { name: "契約内容", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "銀行振込", exact: true })).toHaveCount(0);
    await pickSelect(page, "bt-plan", "スタンダードプラン");
    await page.getByRole("button", { name: "有効にする", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "手動設定でプランを有効にしますか？" });
    await expect(dialog).not.toContainText("入金");
    await dialog.getByRole("button", { name: "有効にする" }).click();
    await expect(page.getByText("スタンダードプランを有効にしました")).toBeVisible();
    // ユーザー詳細から発注者詳細への導線は置かない
    await expect(page.getByRole("link", { name: /発注者詳細/ })).toHaveCount(0);
    // 契約中の表示に切り替わる（変更する / 無効にする）
    await expect(page.getByText("現在：スタンダードプラン（手動設定）")).toBeVisible();
    await expect(page.getByRole("button", { name: "無効にする" })).toBeVisible();
  });

  test("3. 会員の /billing は「ご利用中」。お支払い方法の行は出ず、Stripe 前提のボタンも出ない。カード払いへの切り替えは押せる", async ({ page }) => {
    await login(page, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
    await page.goto("/billing");
    await expect(page.getByText("ご利用中", { exact: true }).first()).toBeVisible();
    // 手動設定の契約は支払い方法を出さない（カード払いだけ「クレジットカード・月払い」と出す）
    await expect(page.getByText("お支払い方法", { exact: true })).toHaveCount(0);
    await expect(page.getByText("銀行振込", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/クレジットカード以外でご契約中の場合、プラン・オプションの変更や解約は運営までご連絡ください/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "解約する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "お支払い情報を管理する" })).toHaveCount(0);
    // カード払いへの切り替え: 全プランの行が「カード払いにする」（現在のプランも含む）
    await expect(page.getByRole("button", { name: /カード払いにする$/ })).toHaveCount(4);
    await expect(page.getByRole("button", { name: "9,800円/月 カード払いにする" })).toBeEnabled();
    // 旧 本人申込ボタンは無く、お問い合わせへの案内が出る
    await expect(page.getByRole("button", { name: "銀行振込で申し込む" })).toHaveCount(0);
    await expect(page.getByText(/銀行振込をご希望の方は/).first()).toBeVisible();
  });
});

test.describe("銀行振込: 未ログインのお問い合わせ", () => {
  test("未ログインでは「銀行振込について」を選べない", async ({ page }) => {
    await page.goto("/contact");
    await page.locator("#inquiryType").click();
    await expect(page.getByRole("option", { name: "料金について", exact: true })).toBeVisible();
    await expect(
      page.getByRole("option", { name: "銀行振込について", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByText(BANK_TRANSFER_GUIDE_START)).toHaveCount(0);
  });
});

/** ユーザーアカウント一覧 → seed の bank-client（振込商店）のユーザー詳細（ADM-009）を開く */
async function openBankClientUserDetail(page: Page) {
  await page.goto("/admin/users?q=bank-client");
  await page.getByRole("link", { name: /(?<!-)bank-client@test\.local/ }).first().click();
  await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "ユーザーアカウント詳細" })).toBeVisible();
}

test.describe.serial("手動設定: 契約中の発注者を「変更する」「無効にする」", () => {
  test("ユーザー詳細（ADM-009）でプランを変更できる。発注者詳細（ADM-004）には枠が無く表示だけ変わる", async ({ page }) => {
    await adminLogin(page);
    await openBankClientUserDetail(page);

    await expect(page.getByText("現在：スタンダードプラン（手動設定）")).toBeVisible();
    await pickSelect(page, "bt-plan", "プレミアムプラン");
    await page.getByRole("button", { name: "変更する", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "プランを変更しますか？" });
    await dialog.getByRole("button", { name: "変更する" }).click();
    await expect(page.getByText("プレミアムプランに変更しました")).toBeVisible();
    await expect(page.getByText("現在：プレミアムプラン（手動設定）")).toBeVisible();
    await expect(page.getByText(/期限間近|期限切れ|期限を延長する/)).toHaveCount(0);

    // 発注者詳細: プランと支払い方法は表示される（手動設定は月払い / 年払いを持たない）が、操作の枠は無い
    await page.goto("/admin/clients?q=bank-client");
    await page.getByRole("link", { name: /振込商店/ }).click();
    await page.waitForURL(/\/admin\/clients\//);
    await expect(page.getByText(/プラン：プレミアム（手動設定）/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "契約内容", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "無効にする" })).toHaveCount(0);
  });

  test("動画プランは何回でも「購入済みにする」ことができ、購入済みの一覧に 1 回ごとに 1 行増える", async ({ page }) => {
    await adminLogin(page);
    await openBankClientUserDetail(page);
    const section = page.getByRole("heading", { name: "契約内容", exact: true }).locator("..");
    await expect(section.getByText("購入済み：")).toBeVisible();
    // 動画プラン・急募オプションともまだ無い
    await expect(section.getByText("なし", { exact: true })).toHaveCount(2);

    for (const expected of [1, 2]) {
      await pickSelect(page, "bt-video", "ユーザー撮影動画制作プラン");
      await page.getByRole("button", { name: "購入済みにする", exact: true }).click();
      const dialog = page.getByRole("alertdialog", { name: "動画プランを購入済みにしますか？" });
      await expect(dialog).toContainText("購入記録を作り、本人と運営にお申し込み受付のメールを送ります");
      await dialog.getByRole("button", { name: "購入済みにする" }).click();
      await expect(page.getByText("ユーザー撮影動画制作プランを購入済みにしました")).toBeVisible();
      await expect(
        section.getByRole("listitem").filter({ hasText: "ユーザー撮影動画制作プラン" }),
      ).toHaveCount(expected);
    }
    await expect(section.getByRole("listitem").first()).toContainText("（手動設定）");
  });

  test("急募オプション: 案件を選んで有効にすると 適用中に並び、募集案件一覧に「急募」タグが付き、プルダウンから消える", async ({ page, browser }) => {
    const jobTitle = "【振込商店】外壁塗装の職人募集（銀行振込 急募E2E）";
    await adminLogin(page);
    await openBankClientUserDetail(page);
    const section = page.getByRole("heading", { name: "契約内容", exact: true }).locator("..");
    await expect(section.getByText("急募オプション", { exact: true })).toBeVisible();
    await expect(section.getByText("適用中：")).toBeVisible();

    // 案件を選ぶまでボタンは押せない
    const button = section.getByRole("button", { name: "急募を有効にする" });
    await expect(button).toBeDisabled();
    await pickSelect(page, "bt-urgent-job", jobTitle);
    await expect(button).toBeEnabled();
    await button.click();
    const dialog = page.getByRole("alertdialog", { name: "急募オプションを有効にしますか？" });
    await expect(dialog).toContainText(`「${jobTitle}」が今日から 7 日間`);
    await dialog.getByRole("button", { name: "有効にする" }).click();
    await expect(page.getByText("急募オプションを有効にしました")).toBeVisible();

    // 適用中に「案件名 〜まで（手動設定）」が並び、対象案件はプルダウンから消える（他に案件が無いので案内文になる）
    const item = section.getByRole("listitem").filter({ hasText: jobTitle });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(/\d{4}\/\d{2}\/\d{2} まで（手動設定）/);
    await expect(section.getByText("急募にできる案件がありません")).toBeVisible();

    // 会員側（別セッション）: 募集案件一覧（CON-002）をキーワードで絞ると、この案件が「急募」タグ付きで出る
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    try {
      await login(memberPage, TEST_BANK_E2E.email, TEST_BANK_E2E.password);
      await memberPage.goto(`/jobs/search?q=${encodeURIComponent("銀行振込 急募E2E")}`);
      await expect(memberPage.getByText(jobTitle)).toBeVisible();
      await expect(memberPage.getByText("急募", { exact: true })).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  test("ユーザー詳細（ADM-009）で無効にすると、その場で有効化の枠に戻る", async ({ page }) => {
    await adminLogin(page);
    await openBankClientUserDetail(page);

    await expect(page.getByText("現在：プレミアムプラン（手動設定）")).toBeVisible();
    await page.getByRole("button", { name: "無効にする" }).click();
    const dialog = page.getByRole("alertdialog", { name: "手動設定の契約を無効にしますか？" });
    await dialog.getByRole("button", { name: "無効にする" }).click();
    await expect(page.getByText("無効にしました")).toBeVisible();
    // 有料プランなし → 「有効にする」が出る
    await expect(page.getByRole("button", { name: "有効にする", exact: true })).toBeVisible();
    await expect(page.getByText(/現在：.*（手動設定）/)).toHaveCount(0);
  });
});

test.describe("カード払いの会員の「契約内容」枠", () => {
  test("カード払いは「（クレジットカード…）」のまま表示され、ボタンは「手動設定に切り替える」（確定はしない）", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`/admin/users?q=${encodeURIComponent(TEST_CLIENT.email)}`);
    await page.getByRole("link", { name: /(?<![-\w])client@test\.local/ }).first().click();
    await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}/);
    const section = page.getByRole("heading", { name: "契約内容", exact: true }).locator("..");
    await expect(section.getByText(/現在：.*（クレジットカード/)).toBeVisible();
    await expect(section.getByRole("button", { name: "銀行振込に切り替える" })).toHaveCount(0);
    await section.getByRole("button", { name: "手動設定に切り替える" }).click();
    const dialog = page.getByRole("alertdialog", { name: "手動設定に切り替えますか？" });
    await expect(dialog).toContainText("の手動設定の契約になります");
    await expect(dialog).not.toContainText("銀行振込");
    await dialog.getByRole("button", { name: "キャンセル" }).click();
  });
});
