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

  test("エリアフィルターで神奈川県を指定すると複数エリアを持つ発注者がヒットする", async ({ page }) => {
    // ?prefecture=神奈川県 で直接アクセス（フォーム送信と同等）
    await page.goto("/clients?prefecture=神奈川県");

    // 鈴木工務店（recruit_area: ['神奈川県', '東京都']）がヒットすること
    await expect(page.getByText("鈴木工務店")).toBeVisible({ timeout: 10000 });

    // 山田建設（recruit_area: ['東京都', '埼玉県']）はヒットしないこと
    await expect(page.getByText("山田建設")).not.toBeVisible();
  });

  test("エリアフィルターで東京都を指定すると両方の発注者がヒットする", async ({ page }) => {
    await page.goto("/clients?prefecture=東京都");

    // 両方とも recruit_area に東京都を含むのでヒットする
    await expect(page.getByText("鈴木工務店")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("山田建設")).toBeVisible({ timeout: 10000 });
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
