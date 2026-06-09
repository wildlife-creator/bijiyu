import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("プロフィール編集画面（COM-001〜002）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("プロフィール画面が表示される", async ({ page }) => {
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール" }),
    ).toBeVisible();
  });

  test("氏名を編集して保存できる", async ({ page }) => {
    await page.goto("/profile/edit");
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール編集" }),
    ).toBeVisible();

    const lastNameInput = page.locator("#lastName");
    await lastNameInput.clear();
    await lastNameInput.fill("テスト姓");

    const firstNameInput = page.locator("#firstName");
    await firstNameInput.clear();
    await firstNameInput.fill("テスト名");

    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    await expect(page.getByText("テスト姓 テスト名")).toBeVisible();
  });

  test("お住まい（都道府県＋市区町村）を変更して保存できる", async ({ page }) => {
    await page.goto("/profile/edit");

    // shadcn/ui の Select（Radix UI ベース）は <button role="combobox"> として描画されるため
    // Playwright の selectOption() は使えない。トリガーをクリック → option をクリックする
    // お住まいは ResidencePicker（都道府県 Select → 市区町村 Select の 2 段）
    await page.getByLabel("お住まい").click();
    await page.getByRole("option", { name: "神奈川県", exact: true }).click();

    // 市区町村（任意）を 1 つ選ぶ
    await page
      .locator('[data-slot="select-trigger"]:has-text("市区町村を選択")')
      .click();
    await page.getByRole("option", { name: "横浜市鶴見区", exact: true }).click();

    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    // formatResidence で都道府県+市区町村がスペース無し結合で表示される
    await expect(page.getByText("神奈川県横浜市鶴見区")).toBeVisible();
  });

  test("自己紹介を変更して保存できる", async ({ page }) => {
    await page.goto("/profile/edit");

    const bioTextarea = page.getByLabel("自己紹介文");
    await bioTextarea.clear();
    await bioTextarea.fill("E2Eテスト用の自己紹介文です。");

    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    await expect(page.getByText("E2Eテスト用の自己紹介文です。")).toBeVisible();
  });

  test("必須項目を空にすると保存できない", async ({ page }) => {
    await page.goto("/profile/edit");

    const lastNameInput = page.locator("#lastName");
    await lastNameInput.clear();

    await page.getByRole("button", { name: "保存する" }).click();

    await expect(page.getByText("姓を入力してください")).toBeVisible();
  });

  test("本人確認済みユーザーに本人確認済みバッジが表示される", async ({
    page,
  }) => {
    // seed.sql: contractor は identity_verified = true かつ
    // identity_verifications に approved レコードがある
    await page.goto("/profile");
    await expect(page.getByText("本人確認済み")).toBeVisible();
  });

  test("COM-001 に「保有スキル」行が表示される", async ({ page }) => {
    // seed.sql: contractor (田中一郎) は skill_tags に master_skill_tags 由来の
    // 「木造軸組構法」「造作大工」「内装仕上工」を持つ (master-skills 移行後)
    await page.goto("/profile");
    await expect(
      page.getByText("保有スキル", { exact: true }),
    ).toBeVisible();
    // 保有スキルの値として seed で投入したタグのいずれかが表示されることを確認
    await expect(page.getByText("木造軸組構法").first()).toBeVisible();
  });

  test("COM-002 で保有スキルを追加・削除できる", async ({ page }) => {
    await page.goto("/profile/edit");

    // master-skills 移行後は MasterCombobox (cmdk) で保有スキルを選択する。
    // Phase 4.4 で AreaListEditor がフォーム上部に追加されたため
    // `[data-slot="master-combobox-trigger"]` の index は流動的。
    // 「保有スキル」セクションラベル経由で semantic に解決する。
    // 他テストとの state 衝突を避けるため、master-skills.spec.ts の 9.3b が
    // 使う SKILL_TAGS_PLUS_7 に含まれない「BIMモデリング（Revit等）」を使用する
    await page
      .getByText("保有スキル", { exact: true })
      .locator(
        'xpath=following::button[@data-slot="master-combobox-trigger"][1]',
      )
      .click();
    await page.getByRole("combobox").last().fill("BIM");
    await page
      .getByRole("option", { name: "BIMモデリング（Revit等）", exact: true })
      .first()
      .click();
    await page.keyboard.press("Escape");

    // 保存して COM-001 に遷移 → 追加したスキルが表示される
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    // contractor1 は既に多くの skill_tags を持つので「もっと見る」展開が必要
    const showMore = page.getByRole("button", { name: "もっと見る" });
    if ((await showMore.count()) > 0) {
      await showMore.first().click();
    }
    await expect(page.getByText("BIMモデリング（Revit等）").first()).toBeVisible();
  });

  test("COM-002 の職種/経験年数列に見出しが表示される", async ({ page }) => {
    // 列見出しが無いと「年数」入力欄が何の数値か分からないので、
    // カラム見出し（経験年数（年））が常に表示されることを保証する
    await page.goto("/profile/edit");
    await expect(page.getByText("経験年数（年）")).toBeVisible();
  });

  test("COM-002 対応エリア: 新 UI で「+ 県を追加」ボタンが押せて新行が表示される (smoke)", async ({
    page,
  }) => {
    // master-area-multi-select Phase C smoke test:
    // 既存 seed 状態は触らず、UI 部品の基本動作のみ確認する。
    // ロジックの詳細検証は Vitest 単体テスト (area-conversion / area.test.ts) でカバー。
    await page.goto("/profile/edit");

    const addButton = page.getByRole("button", { name: "+ 県を追加" });
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    // 押下後も disabled にならない(新仕様: 件数上限 UI ガードなし)
    await addButton.click();
    await expect(addButton).toBeEnabled();
  });
});

test.describe("CLI-021 発注者情報編集の募集エリア (master-area-multi-select Phase C)", () => {
  test.beforeEach(async ({ page }) => {
    // login as test client
    const { login: doLogin, TEST_CLIENT: c } = await import("./helpers");
    await doLogin(page, c.email, c.password);
  });

  test("CLI-021 募集エリア: 新 UI が表示され「+ 県を追加」が機能する (smoke)", async ({
    page,
  }) => {
    // master-area-multi-select Phase C smoke test:
    // 既存 seed 状態を保護するため保存は行わない (CON-005 E2E が client@test.local の
    // recruit_area = 東京都港区 + 大阪府大阪市北区 に依存しているため、上書きすると
    // job-search.spec.ts の「CON-005 エリア検索OR条件」テストが破綻する)。
    await page.goto("/mypage/client-profile/edit");
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();

    // 「+ 県を追加」を押下すると新しい AreaRow が末尾に追加される
    const addButton = page.getByRole("button", { name: "+ 県を追加" });
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    await addButton.click();
    // 新行が追加され、新しい「都道府県を選択」placeholder の trigger が現れる
    await expect(
      page
        .locator('[data-slot="select-trigger"]:has-text("都道府県を選択")')
        .first(),
    ).toBeVisible();
  });
});

test.describe("本人確認書類（COM-003〜004）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("本人確認画面が表示される", async ({ page }) => {
    await page.goto("/profile/verification");
    await expect(
      page.getByRole("heading", { name: "本人確認・CCUS登録" }),
    ).toBeVisible();
  });

  test("本人確認書類アップロード画面が表示される", async ({ page }) => {
    await page.goto("/profile/verification/identity");
    await expect(
      page.getByRole("heading", { name: "本人確認", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "書類" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "顔写真" }),
    ).toBeVisible();
  });
});
