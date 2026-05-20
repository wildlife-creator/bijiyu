import { test, expect } from "@playwright/test";
import { login, TEST_CLIENT } from "./helpers";

test.describe("案件掲載機能（CLI-001〜004）", () => {
  test.beforeEach(async ({ page }) => {
    // Login as client user
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
  });

  test("募集現場一覧ページが表示される（CLI-001）", async ({ page }) => {
    await page.goto("/jobs/manage");
    await expect(
      page.getByRole("heading", { name: "募集現場一覧" })
    ).toBeVisible();
    await expect(page.getByText("新規作成")).toBeVisible();
  });

  test("新規登録フォームが表示される（CLI-004）", async ({ page }) => {
    await page.goto("/jobs/create");
    await expect(
      page.getByRole("heading", { name: "募集現場新規登録" })
    ).toBeVisible();
    await expect(page.getByText("タイトル 必須")).toBeVisible();
    await expect(page.getByText("募集職種 必須")).toBeVisible();
  });

  test("案件を下書き保存できる", async ({ page }) => {
    await page.goto("/jobs/create");

    // Fill required fields
    await page.getByPlaceholder("案件タイトルを入力").fill("E2Eテスト案件");
    await page.getByPlaceholder("請負案件の詳細を入力").fill("E2Eテストの案件詳細説明です。");

    // Reward (upper first, then lower in the form)
    await page.getByPlaceholder("上限").fill("20000");
    await page.getByPlaceholder("下限").fill("15000");

    // Select area (エリア) — master-area-multi-select Phase C 以降は
    // AreaListEditor (1 行 = 都道府県 Select + 「全域」Checkbox + 市区町村 Checkbox 群)。
    // 初期 value = [] のため「+ 県を追加」で行を作ってから操作する。
    await page.getByRole("button", { name: "+ 県を追加" }).click();
    // 行を追加した直後、最初の select-trigger が AreaRow の都道府県 Select になる
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole("option", { name: "東京都", exact: true }).click();
    // 全域 Checkbox を ON にして県全域指定とする
    await page.getByLabel("全域").check();

    // Select trade types (募集職種) — MasterCombobox (multi)
    // AreaListEditor が disabled な 市区町村 master-combobox-trigger を 1 個追加
    // (都道府県を「東京都」に変えた後は enabled になる) するため
    // `.first()` だと 市区町村 trigger に誤マッチする。MasterCombobox の
    // placeholder「募集職種を検索」が trigger の accessible name になるため
    // accessible name で一意に解決する。
    await page.getByRole("button", { name: "募集職種を検索" }).click();
    await page.getByRole("combobox").last().fill("大工");
    await page.getByRole("option", { name: "建築/躯体｜大工" }).first().click();
    await page.keyboard.press("Escape");

    // Headcount
    await page.getByPlaceholder("人数").fill("2");

    // Dates
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
    const format = (d: Date) => d.toISOString().split("T")[0];

    await page.locator('input[type="date"]').nth(0).fill(format(nextMonth));
    await page.locator('input[type="date"]').nth(1).fill(format(endMonth));
    await page.locator('input[type="date"]').nth(2).fill(format(today));
    await page.locator('input[type="date"]').nth(3).fill(format(nextMonth));

    // Save as draft
    await page.getByRole("button", { name: "下書き保存" }).click();

    // Should redirect to detail page (with ?manage=true)
    await page.waitForURL(/\/jobs\/[a-f0-9-]+/);
    await expect(page.getByText("E2Eテスト案件")).toBeVisible();
  });

  test("案件詳細画面に編集ボタンがある（CLI-002）", async ({ page }) => {
    // Use the seed data job (66666666-6666-6666-6666-666666666666)
    // CLI-002 is accessed via ?manage=true (from CLI-001)
    await page.goto("/jobs/66666666-6666-6666-6666-666666666666?manage=true");
    await expect(
      page.getByRole("heading", { name: "募集現場詳細" })
    ).toBeVisible();
    await expect(page.getByText("編集する").first()).toBeVisible();
  });

  test("バリデーションエラーが表示される", async ({ page }) => {
    await page.goto("/jobs/create");

    // Submit without filling required fields
    await page.getByRole("button", { name: "公開する" }).click();

    // Should show validation error toast
    await expect(
      page.getByText("入力内容に不備があります")
    ).toBeVisible();
  });

  test("エリアを 10 件超で公開すると保存時エラーが出る（master-area-multi-select R7-5）", async ({
    page,
  }) => {
    // 11 県 × 全域チェック = 11 件展開 = jobAreaRowsSchema の refine
    // 「エリアは最大 10 件まで」エラーがトーストで出ることを assert する。
    // ボタン自体は disabled にせず保存時エラーで返す方式(新仕様)。
    await page.goto("/jobs/create");
    await page.getByPlaceholder("案件タイトルを入力").fill("E2E 10 件上限テスト");
    await page.getByPlaceholder("請負案件の詳細を入力").fill("詳細");
    await page.getByPlaceholder("上限").fill("20000");
    await page.getByPlaceholder("下限").fill("15000");

    const prefs = [
      "東京都",
      "神奈川県",
      "千葉県",
      "埼玉県",
      "茨城県",
      "栃木県",
      "群馬県",
      "山梨県",
      "静岡県",
      "愛知県",
      "大阪府",
    ];
    const addButton = page.getByRole("button", { name: "+ 県を追加" });
    for (const pref of prefs) {
      await addButton.click();
      // 新規追加された行の trigger は placeholder「都道府県を選択」を持つ唯一の trigger
      await page
        .locator('[data-slot="select-trigger"]:has-text("都道府県を選択")')
        .first()
        .click();
      await page.getByRole("option", { name: pref, exact: true }).click();
      // この行の「全域」をチェック (各県につき 1 つだけ追加されるので .last() で当該行)
      await page.getByLabel("全域").last().check();
    }

    // 募集職種
    await page.getByRole("button", { name: "募集職種を検索" }).click();
    await page.getByRole("combobox").last().fill("大工");
    await page.getByRole("option", { name: "建築/躯体｜大工" }).first().click();
    await page.keyboard.press("Escape");

    await page.getByPlaceholder("人数").fill("2");
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
    const format = (d: Date) => d.toISOString().split("T")[0];
    await page.locator('input[type="date"]').nth(0).fill(format(nextMonth));
    await page.locator('input[type="date"]').nth(1).fill(format(endMonth));
    await page.locator('input[type="date"]').nth(2).fill(format(today));
    await page.locator('input[type="date"]').nth(3).fill(format(nextMonth));

    const publishBtn = page.getByRole("button", { name: "公開する" });
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();

    // jobAreaRowsSchema の tooManyAreasForJob メッセージは
    //   (a) フォーム内 inline エラー (常時表示, より stable)
    //   (b) Sonner トースト (5s で消える)
    // の 2 か所に出る。inline 側で検証する。
    await expect(
      page.locator("text=/エリアは最大 ?10 ?件まで/").first(),
    ).toBeVisible({ timeout: 8000 });
  });
});
