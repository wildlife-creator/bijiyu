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

  test("都道府県を変更して保存できる", async ({ page }) => {
    await page.goto("/profile/edit");

    // shadcn/ui の Select（Radix UI ベース）は <button role="combobox"> として描画されるため
    // Playwright の selectOption() は使えない。トリガーをクリック → option をクリックする
    await page.getByLabel("お住まい（都道府県）").click();
    await page.getByRole("option", { name: "大阪府" }).click();

    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    await expect(page.getByText("大阪府")).toBeVisible();
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
    // 保有スキルの trigger は trades 2 (contractor1 既存) の次 = index 2
    // 他テストとの state 衝突を避けるため、master-skills.spec.ts の 9.3b が
    // 使う SKILL_TAGS_PLUS_7 に含まれない「BIMモデリング（Revit等）」を使用する
    await page.locator('[data-slot="master-combobox-trigger"]').nth(2).click();
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
