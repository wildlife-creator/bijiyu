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

    await page.getByRole("button", { name: "確認する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    await expect(page.getByText("テスト姓 テスト名")).toBeVisible();
  });

  test("都道府県を変更して保存できる", async ({ page }) => {
    await page.goto("/profile/edit");

    const prefSelect = page.getByLabel("お住まい（都道府県）");
    await prefSelect.selectOption("大阪府");

    await page.getByRole("button", { name: "確認する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    await expect(page.getByText("大阪府")).toBeVisible();
  });

  test("自己紹介を変更して保存できる", async ({ page }) => {
    await page.goto("/profile/edit");

    const bioTextarea = page.getByLabel("自己紹介文");
    await bioTextarea.clear();
    await bioTextarea.fill("E2Eテスト用の自己紹介文です。");

    await page.getByRole("button", { name: "確認する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 10000 });
    await expect(page.getByText("E2Eテスト用の自己紹介文です。")).toBeVisible();
  });

  test("必須項目を空にすると保存できない", async ({ page }) => {
    await page.goto("/profile/edit");

    const lastNameInput = page.locator("#lastName");
    await lastNameInput.clear();

    await page.getByRole("button", { name: "確認する" }).click();

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
