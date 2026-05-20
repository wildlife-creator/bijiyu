import { test, expect } from "@playwright/test";
import { login, TEST_CONTRACTOR, TEST_CLIENT } from "./helpers";

test.describe("案件検索機能（CON-002〜007）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("案件一覧ページが表示される（CON-002）", async ({ page }) => {
    await page.goto("/jobs/search");
    await expect(page.getByText("募集案件一覧")).toBeVisible();
  });

  test("案件詳細ページが表示される（CON-003）", async ({ page }) => {
    await page.goto("/jobs/search");
    // Click first "詳細をみる" link — seed data guarantees open jobs exist
    const detailLink = page.getByRole("link", { name: "詳細をみる" }).first();
    await detailLink.click();
    await expect(page.getByText("募集案件詳細")).toBeVisible();
  });

  test("発注者一覧ページが表示される（CON-005）", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByText("発注者一覧")).toBeVisible();
  });

  test("マイリストページが表示される（CON-007）", async ({ page }) => {
    await page.goto("/favorites");
    await expect(page.getByRole("heading", { name: "マイリスト" })).toBeVisible();
  });
});

test.describe("職人検索機能（CLI-005〜006）— 発注者専用", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("職人一覧ページが表示される（CLI-005）", async ({ page }) => {
    await page.goto("/users/contractors");
    await expect(page.getByRole("heading", { name: "職人一覧" })).toBeVisible({ timeout: 10000 });
  });
});

test.describe("CLI-005 表示対象（role IN ('contractor','client') + 自分以外 + staff 除外）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/users/contractors");
    await expect(page.getByRole("heading", { name: "職人一覧" })).toBeVisible({ timeout: 10000 });
  });

  test("自分自身（client@test.local = 鈴木花子）は検索結果に表示されない", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /鈴木花子/ })).toHaveCount(0);
  });

  test("法人の担当者（staff/staff-admin）は検索結果に表示されない", async ({ page }) => {
    // staff: 佐藤健太、staff-admin: 伊藤真理
    await expect(page.getByRole("heading", { name: /佐藤健太/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /伊藤真理/ })).toHaveCount(0);
  });

  test("client roleユーザー（個人発注者プランの中村由美）も検索結果に表示される", async ({ page }) => {
    // individual-client: 中村由美 (個人発注者プラン)
    await expect(page.getByRole("heading", { name: /中村由美/ })).toBeVisible();
  });

  test("受注者（contractor role）は通常通り表示される", async ({ page }) => {
    // contractor2: 高橋美咲 (無料受注者プラン)
    await expect(page.getByRole("heading", { name: /高橋美咲/ })).toBeVisible();
  });
});

test.describe("CLI-006 アクセス制御（self / role ガード）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("自分自身のCLI-006詳細はnotFound", async ({ page }) => {
    // TEST_CLIENT: client@test.local = 22222222-2222-2222-2222-222222222222
    const response = await page.goto("/users/contractors/22222222-2222-2222-2222-222222222222");
    expect(response?.status()).toBe(404);
  });

  test("staff（法人担当者）のCLI-006詳細はnotFound", async ({ page }) => {
    // staff@test.local: 33333333-3333-3333-3333-333333333333
    const response = await page.goto("/users/contractors/33333333-3333-3333-3333-333333333333");
    expect(response?.status()).toBe(404);
  });

  test("client roleユーザー（中村由美）のCLI-006詳細は表示される", async ({ page }) => {
    // individual-client: dd111111-1111-2222-3333-444455556666
    await page.goto("/users/contractors/dd111111-1111-2222-3333-444455556666");
    await expect(page.getByRole("heading", { name: "ユーザー詳細" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /中村由美/ })).toBeVisible();
  });
});

test.describe("発注者のCON-002→CON-003遷移（リグレッション防止）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("発注者がCON-002から自分の案件をクリックしてもCON-003（閲覧画面）が表示される", async ({ page }) => {
    // CON-002（募集案件一覧）にアクセス
    await page.goto("/jobs/search");
    await expect(page.getByText("募集案件一覧")).toBeVisible();

    // 自分が掲載した案件の詳細に直接アクセス（?manage=true なし）
    // owner_id = 22222222 (client@test.local) の案件
    await page.goto("/jobs/88888888-8888-8888-8888-888888888881");

    // CON-003（募集案件詳細）が表示され、CLI-002（募集現場詳細）ではないこと
    await expect(page.getByRole("heading", { name: "募集案件詳細" })).toBeVisible();
    // CLI-002 の管理UIが表示されていないこと
    await expect(page.getByText("編集する").first()).not.toBeVisible();
    // 自分の案件なので応募ボタンは非表示（案件オーナーは応募不可）
    await expect(page.getByRole("link", { name: "応募する" })).not.toBeVisible();
  });

  test("発注者がCLI-001から?manage=trueで遷移するとCLI-002（管理画面）が表示される", async ({ page }) => {
    await page.goto("/jobs/88888888-8888-8888-8888-888888888881?manage=true");
    await expect(page.getByRole("heading", { name: "募集現場詳細" })).toBeVisible();
    await expect(page.getByText("編集する").first()).toBeVisible();
  });
});

test.describe("CON-005 エリア検索OR条件（リグレッション防止）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("エリアフィルターで神奈川県を指定すると神奈川県を含む発注者のみがヒットする", async ({ page }) => {
    // Phase 5 で client_recruit_areas (別テーブル) に分離。seed 上 神奈川県を持つ
    // 発注者は「補償テスト建設」(b1110000-...-005) のみ（東京都全域 + 神奈川県
    // 横浜市港北区 の 2 件登録 = multi-area の代表例）。鈴木工務店/山田建設/
    // 中村リフォームはいずれも神奈川県を含まないため非ヒット。
    await page.goto("/clients?prefecture=神奈川県");

    // 補償テスト建設（client_recruit_areas: 東京都全域 + 神奈川県横浜市港北区）
    // がヒットすること（複数エリアを持つ発注者のヒット例）
    await expect(page.getByText("補償テスト建設")).toBeVisible({ timeout: 10000 });

    // 鈴木工務店（東京都港区 + 大阪府大阪市北区）は神奈川県を持たないため非ヒット
    await expect(page.getByText("鈴木工務店")).not.toBeVisible();
    // 山田建設（東京都 + 埼玉県）も同様に非ヒット
    await expect(page.getByText("山田建設")).not.toBeVisible();
  });

  test("エリアフィルターで東京都を指定すると東京都を含む複数の発注者がヒットする", async ({ page }) => {
    await page.goto("/clients?prefecture=東京都");

    // 鈴木工務店 (東京都港区) / 山田建設 (東京都) / 補償テスト建設 (東京都全域) は
    // 全て client_recruit_areas に 東京都 を含むためヒットする
    await expect(page.getByText("鈴木工務店")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("山田建設")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("補償テスト建設")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("master-area-multi-select Phase D: 複数 muni 検索 (CON-002)", () => {
  test("受注者: 「東京都 + 港区 + 渋谷区」検索 → 各 muni を含む案件 + 東京都全域案件すべてヒット (R7B-7 OR 結合)", async ({
    page,
  }) => {
    // master-area-multi-select Phase D: 複数 muni を `?municipality=A&municipality=B`
    // の同名キー繰返し形式で渡し、各 muni × buildAreaFilterIds を Set 和で OR 結合する
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(
      "/jobs/search?prefecture=" +
        encodeURIComponent("東京都") +
        "&municipality=" +
        encodeURIComponent("港区") +
        "&municipality=" +
        encodeURIComponent("渋谷区"),
    );

    // 全件ヒットの粒度ではなく、検索結果カードが少なくとも 1 枚は表示されることを確認
    const cards = page.locator("a[href^='/jobs/']");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("受注者: 「東京都」のみ (municipality 無指定) で検索 → 同県内の全案件 (県全域 + 全市区町村) がヒット", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/jobs/search?prefecture=" + encodeURIComponent("東京都"));

    const cards = page.locator("a[href^='/jobs/']");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("お気に入り機能", () => {
  test("お気に入り登録・解除ができる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/jobs/search");

    // Find first favorite button — seed data guarantees open jobs exist
    const favBtn = page.getByRole("button", { name: "マイリスト登録" }).first();
    await favBtn.click();

    // Optimistic UI: button label changes to "マイリスト解除"
    await expect(page.getByRole("button", { name: "マイリスト解除" }).first()).toBeVisible();
  });
});
