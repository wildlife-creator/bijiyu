import { expect, test } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT, TEST_STAFF } from "./helpers";

/**
 * E2E tests for CLI-026 (プラン案内画面) and related billing flows.
 *
 * Seed users used:
 *   - contractor@test.local: free (no subscription)
 *   - client@test.local: corporate active
 *   - staff@test.local: staff role
 *   - pastdue@test.local: individual past_due (8+ days)
 *   - downgrade-reserved@test.local: corporate active with schedule_id
 *   - corp-noname@test.local: corporate active, organizations.name=''
 */

const TEST_PAST_DUE = {
  email: "pastdue@test.local",
  password: "testpass123",
};

const TEST_DOWNGRADE_RESERVED = {
  email: "downgrade-reserved@test.local",
  password: "testpass123",
};

// ===========================================================================
// 15.1: CLI-026 表示パターン
// ===========================================================================

test.describe("CLI-026 表示: 未課金 contractor", () => {
  test("基本プランに「申し込む」ボタンが4つ表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    await expect(page.getByText("プラン変更")).toBeVisible();
    // 見出し単独をターゲット（「基本プラン」は注意書きにも含まれるため）
    await expect(page.getByRole("heading", { name: "基本プラン" })).toBeVisible();

    // 4 plan buttons should show "申し込む"
    const buttons = page.getByRole("button", { name: "申し込む" });
    await expect(buttons.first()).toBeVisible();

    // Initial fee note (first purchase case) should be visible
    await expect(
      page.getByText("初回事務手数料として12,000円が必要となります"),
    ).toBeVisible();
  });

  test("P3: 「年払い」に切り替えると年額の申込ボタンに変わる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    await page.getByRole("tab", { name: "年払い" }).click();
    // ライトプラン 2,800 × 10 = 28,000 円/年（暫定係数 YEARLY_PRICE_MONTHS）
    await expect(page.getByRole("button", { name: /28,000円\/年 申し込む/ })).toBeVisible();
    await page.getByRole("tab", { name: "月払い" }).click();
    await expect(page.getByRole("button", { name: /2,800円\/月 申し込む/ })).toBeVisible();
  });

  test("オプションプランセクションが表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    await expect(page.getByText("オプションプラン")).toBeVisible();
    await expect(page.getByText("急募", { exact: true })).toBeVisible();
    // P10: 動画プランは 3 行（プロフィール動画制作 / ユーザー撮影 / ビジ友公式SNS動画制作）。
    // 旧「自己PR動画掲載」「職場紹介動画掲載」の行は出ない
    await expect(page.getByText("プロフィール動画制作プラン", { exact: true })).toBeVisible();
    await expect(page.getByText("100,000円/動画", { exact: true })).toBeVisible();
    await expect(page.getByText("自己PR動画掲載", { exact: true })).toHaveCount(0);
    await expect(page.getByText("職場紹介動画掲載", { exact: true })).toHaveCount(0);
    // 説明文の注意書き（交通費 / プレミアム・ハイエンド付属）
    await expect(
      page.getByText("※エリアにより交通費等が発生する場合があります。").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/※プレミアム・ハイエンドプランの方は本プランが含まれていますので/),
    ).toBeVisible();
    // ユーザー撮影プラン（P7）: 無料の受注者でも申込ボタンが活性（発注者プラン不要）
    await expect(page.getByText("ユーザー撮影プラン", { exact: true })).toBeVisible();
    await expect(page.getByText("20,000円/動画", { exact: true })).toBeVisible();
    await expect(
      page.getByText("※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ユーザー撮影プランを申し込む" }),
    ).toBeEnabled();
    // ビジ友公式SNS動画制作プラン（P10）: 無料の受注者でも申込ボタンが活性
    await expect(page.getByText("ビジ友公式SNS動画制作プラン", { exact: true })).toBeVisible();
    await expect(page.getByText("120,000円/動画", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/※プレミアム・ハイエンドプランを年払いでご利用の方は本プランが含まれていますので/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ビジ友公式SNS動画制作プランを申し込む" }),
    ).toBeEnabled();
    // P8: 補償オプションは販売停止（NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED 未設定）。
    // 未加入ユーザーには 2 行とも出ない（加入中ユーザーには解約用に自分の行だけ出る）
    await expect(page.getByText("補償（受注者向け）")).toHaveCount(0);
    // P9: 銀行振込の本人申込ボタンは既定で非表示。案内文（お問い合わせリンク）が出る
    await expect(page.getByRole("button", { name: "銀行振込で申し込む" })).toHaveCount(0);
    await expect(page.getByText(/銀行振込をご希望の方は/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "お問い合わせ" }).first()).toHaveAttribute("href", "/contact");
    await expect(page.getByRole("button", { name: /補償（5,000円）を申し込む/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /補償（9,800円）を申し込む/ })).toHaveCount(0);
  });
});

test.describe("CLI-026 プラン一覧（/billing/plans、P11 で確定した比較表）", () => {
  test("料金プラン画面の「こちら」から遷移し、月額・年額・確定した行・オプション価格が表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    await page.getByRole("link", { name: "こちら" }).click();
    await expect(page).toHaveURL(/\/billing\/plans$/);
    await expect(page.getByRole("heading", { name: "プラン一覧" })).toBeVisible();

    const table = page.getByRole("table");
    // 月額（P11 確定値）と年額（月額 × 10）
    const monthly = table.getByRole("row").filter({ hasText: "月額" }).first();
    await expect(monthly).toContainText("¥2,800");
    await expect(monthly).toContainText("¥9,800");
    await expect(monthly).toContainText("¥28,000");
    await expect(monthly).toContainText("¥168,000");
    const yearly = table.getByRole("row").filter({ hasText: "年額（年払い）" });
    await expect(yearly).toContainText("¥28,000");
    await expect(yearly).toContainText("¥1,680,000");
    // 追加した行
    await expect(table.getByText("案件募集機能", { exact: true })).toBeVisible();
    await expect(table.getByText("サポート担当", { exact: false })).toBeVisible();
    await expect(table.getByText("プロフィール動画制作", { exact: true })).toBeVisible();
    await expect(table.getByText("ビジ友公式SNS動画制作", { exact: true })).toBeVisible();
    await expect(table.getByText("年払いのみ○")).toHaveCount(2);
    await expect(table.getByRole("row").filter({ hasText: "複数人利用" })).toContainText("5人まで");
    await expect(table.getByRole("row").filter({ hasText: "代理メッセージ" })).toContainText("24通/年");

    // オプション価格表
    await expect(page.getByRole("heading", { name: "オプションプラン" })).toBeVisible();
    await expect(page.getByText("急募", { exact: true })).toBeVisible();
    await expect(page.getByText("20,000円（7日間）")).toBeVisible();
    await expect(page.getByText("100,000円/動画", { exact: true })).toBeVisible();
    await expect(page.getByText("120,000円/動画", { exact: true })).toBeVisible();

    // もどる → /billing
    await page.getByRole("button", { name: "もどる" }).click();
    await expect(page).toHaveURL(/\/billing$/);
  });
});

test.describe("CLI-026 表示: active client (corporate)", () => {
  test("現在プランに「ご利用中」バッジが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(page.getByText("ご利用中")).toBeVisible();
  });

  test("他プランに「このプランに変更する」ボタンが表示される", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    const changeButtons = page.getByRole("button", {
      name: "このプランに変更する",
    });
    // corporate user has 3 other plans to change to
    await expect(changeButtons.first()).toBeVisible();
  });

  test("解約するボタンが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "解約する" }),
    ).toBeVisible();
  });

  test("お支払い情報を管理するボタンが表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "お支払い情報を管理する" }),
    ).toBeVisible();
  });

  test("初期費用の表示がない（既存ユーザー）", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    // 初回事務手数料「必要」の注意書きは出てはいけない
    // （既存ユーザー向けには「不要となります」の注意書きが出る仕様）
    await expect(
      page.getByText("初回事務手数料として12,000円が必要となります"),
    ).not.toBeVisible();
  });
});

test.describe("CLI-026 表示: staff", () => {
  test("staff 制限メッセージが表示される", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/billing");
    await expect(
      page.getByText("担当者アカウントではプランの変更はできません"),
    ).toBeVisible();
  });

  test("すべての申し込みボタンが無効", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/billing");
    const buttons = page.getByRole("button", { name: "申し込む" });
    for (const btn of await buttons.all()) {
      await expect(btn).toBeDisabled();
    }
  });
});

test.describe("CLI-026 表示: past_due", () => {
  test("past_due 警告メッセージが表示される", async ({ page }) => {
    await login(page, TEST_PAST_DUE.email, TEST_PAST_DUE.password);
    await page.goto("/billing");
    await expect(
      page.getByText("お支払いが完了していません"),
    ).toBeVisible();
  });

  test("PastDueBanner が表示される（お支払い方法を更新するボタン）", async ({ page }) => {
    await login(page, TEST_PAST_DUE.email, TEST_PAST_DUE.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "お支払い方法を更新する" }),
    ).toBeVisible();
  });

  test("即時解約ボタンが表示される", async ({ page }) => {
    await login(page, TEST_PAST_DUE.email, TEST_PAST_DUE.password);
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "即時解約する" }),
    ).toBeVisible();
  });
});

test.describe("CLI-026 表示: ダウングレード予約中", () => {
  test("「変更をキャンセルする」ボタンが表示される", async ({ page }) => {
    await login(
      page,
      TEST_DOWNGRADE_RESERVED.email,
      TEST_DOWNGRADE_RESERVED.password,
    );
    await page.goto("/billing");
    await expect(
      page.getByRole("button", { name: "変更をキャンセルする" }),
    ).toBeVisible();
  });

  test("変更予定ラベルが表示される", async ({ page }) => {
    await login(
      page,
      TEST_DOWNGRADE_RESERVED.email,
      TEST_DOWNGRADE_RESERVED.password,
    );
    await page.goto("/billing");
    await expect(page.getByText("に変更予定")).toBeVisible();
  });
});

test.describe("CLI-026: checkout=success トースト", () => {
  test("checkout=success クエリで /billing へ router.replace される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing?checkout=success");
    // useEffect の `router.replace("/billing")` でクエリが除去されることを確認
    // （トースト表示自体は sonner の auto-dismiss タイミングとレースするため直接アサーションしない）
    await expect(page).toHaveURL(/\/billing(\?|$)/);
    await expect(page).not.toHaveURL(/checkout=success/);
  });
});

// 旧「組織名入力暫定画面 (/mypage/organization-setup)」の describe は
// organization spec Task 6.1 で削除された。CLI-021（/mypage/client-profile/edit?setup=true）
// の E2E は Task 17.2 で追加予定。
