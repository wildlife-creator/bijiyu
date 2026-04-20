import { expect, test } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_INDIVIDUAL_CLIENT,
  TEST_STAFF,
} from "./helpers";

/**
 * organization spec Task 17.1: スカウトテンプレート CRUD E2E
 *
 * 各テストは独立したブラウザコンテキスト（Playwright のデフォルト isolation）で
 * 動く。cross-user フローは独立テストに分割し、seed に依存しない
 * create-then-clean パターンで実装する。
 */

// ---------------------------------------------------------------------------
// 個人プランのテンプレ CRUD（create → list → detail → edit → delete）
// ---------------------------------------------------------------------------
test.describe("個人プラン発注者のスカウトテンプレ CRUD（CLI-016〜019）", () => {
  test("新規作成 → 一覧表示", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );

    await page.goto("/messages/templates");
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "新規作成" }).click();
    await page.waitForURL(/\/messages\/templates\/new$/);

    const title = `E2E_個人作成_${Date.now()}`;
    await page.getByLabel("タイトル").fill(title);
    await page.getByLabel("本文").fill("個人プラン用の本文です。");
    await page.getByLabel("メモ").fill("個人プラン用のメモです。");
    await page.getByRole("button", { name: "保存する" }).click();

    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(title)).toBeVisible();
  });

  test("作成 → 詳細 → 編集 → 削除の通しフロー", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );

    // UI 経由で遷移（page.goto で直接開くと稀に react-hook-form の
     // hydration 前に fill が走るため、一覧画面から「新規作成」リンクで遷移）
    await page.goto("/messages/templates");
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "新規作成" }).click();
    await page.waitForURL(/\/messages\/templates\/new$/);
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート新規登録" }),
    ).toBeVisible();
    const title = `E2E_個人フル_${Date.now()}`;
    await page.getByLabel("タイトル").fill(title);
    await page.getByLabel("本文").fill("フル通し用の本文です。");
    await page.getByLabel("メモ").fill("フル通し用メモ");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible({ timeout: 15000 });

    // 詳細へ
    await page.getByText(title).click();
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート詳細" }),
    ).toBeVisible({ timeout: 10000 });

    // 編集
    await page.getByRole("link", { name: "編集する" }).click();
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート編集" }),
    ).toBeVisible({ timeout: 10000 });
    const updatedTitle = `${title}_更新`;
    await page.getByLabel("タイトル").fill(updatedTitle);
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート詳細" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(updatedTitle)).toBeVisible();

    // 削除（window.confirm を自動承諾）
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(
      page.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(updatedTitle)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------
test.describe("スカウトテンプレのバリデーション（Task 9.1 Zod）", () => {
  test("タイトル未入力は送信できない / エラー表示", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/messages/templates/new");
    await page.getByLabel("本文").fill("本文のみ");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("タイトルを入力してください")).toBeVisible();
    await expect(page).toHaveURL(/\/messages\/templates\/new$/);
  });

  test("本文未入力は送信できない / エラー表示", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/messages/templates/new");
    await page.getByLabel("タイトル").fill("タイトルのみ");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("本文を入力してください")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 法人プラン: 組織メンバー共有
// ---------------------------------------------------------------------------
test.describe("法人プラン: 組織メンバーが他メンバー作テンプレを閲覧（組織共有 RLS）", () => {
  test("Owner が作成したテンプレを Staff が一覧で見える", async ({ browser }) => {
    // Owner 用コンテキスト + Staff 用コンテキストを分離
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await login(ownerPage, TEST_CLIENT.email, TEST_CLIENT.password);
    const sharedTitle = `E2E_組織共有_${Date.now()}`;
    await ownerPage.goto("/messages/templates");
    await ownerPage.getByRole("link", { name: "新規作成" }).click();
    await ownerPage.waitForURL(/\/messages\/templates\/new$/);
    await ownerPage.getByLabel("タイトル").fill(sharedTitle);
    await ownerPage.getByLabel("本文").fill("組織共有テンプレ本文");
    await ownerPage.getByLabel("メモ").fill("組織共有用メモ");
    await ownerPage.getByRole("button", { name: "保存する" }).click();
    await expect(
      ownerPage.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible({ timeout: 10000 });

    // Staff 用コンテキストで一覧確認
    const staffCtx = await browser.newContext();
    const staffPage = await staffCtx.newPage();
    await login(staffPage, TEST_STAFF.email, TEST_STAFF.password);
    await staffPage.goto("/messages/templates");
    await expect(staffPage.getByText(sharedTitle)).toBeVisible();

    // クリーンアップ: Staff が削除（組織共有 RLS で削除可能）
    await staffPage.getByText(sharedTitle).click();
    staffPage.once("dialog", (d) => d.accept());
    await staffPage.getByRole("button", { name: "削除する" }).click();
    await expect(
      staffPage.getByRole("heading", { name: "スカウトテンプレート一覧" }),
    ).toBeVisible({ timeout: 10000 });

    await ownerCtx.close();
    await staffCtx.close();
  });
});
