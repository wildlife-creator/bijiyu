import { test, expect } from "@playwright/test";

import {
  login,
  TEST_CONTRACTOR,
  TEST_CONTRACTOR2,
  TEST_CLIENT,
  TEST_STAFF,
} from "./helpers";

// 鈴木工務店株式会社（法人プラン owner、org 55555555）。受信箱は組織共有。
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";

test.describe("求人へのお問い合わせ（job-inquiry / COM-013〜015）", () => {
  test("受注者: CON-005→CON-006→フォーム送信→完了トースト（通し導線）", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);

    // マイページ → 発注者一覧(CON-005)
    await page.getByRole("link", { name: "発注者一覧" }).click();
    await page.waitForURL(/\/clients/);

    // 鈴木工務店の発注者詳細(CON-006)へ
    await page.locator(`a[href="/clients/${CLIENT_ID}"]`).first().click();
    await page.waitForURL(new RegExp(`/clients/${CLIENT_ID}$`));
    await expect(
      page.getByRole("heading", { name: "鈴木工務店株式会社" }),
    ).toBeVisible();

    // 求人へのお問い合わせボタン → フォーム(COM-013)
    await page.getByRole("link", { name: "求人へのお問い合わせ" }).click();
    await page.waitForURL(/\/inquiry$/);
    await expect(
      page.getByRole("heading", { name: "求人へのお問い合わせ" }),
    ).toBeVisible();

    // お問い合わせ項目（必須・複数選択）
    await page
      .getByRole("checkbox", { name: "求人について話を聞きたい" })
      .click();

    // 送信（氏名・メールは登録値がプリフィル済み）
    await page.getByRole("button", { name: "送信する" }).click();

    // CON-006 に戻り完了トースト
    await page.waitForURL(new RegExp(`/clients/${CLIENT_ID}(\\?.*)?$`));
    await expect(
      page.getByText("問い合わせを送信しました").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("発注者: マイページ→受信箱一覧→詳細（送信者情報・mailto リンク）", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    await page.getByRole("link", { name: "求人へのお問い合わせ" }).click();
    await page.waitForURL(/\/mypage\/job-inquiries$/);

    // 受信箱一覧(COM-014)にシードの問い合わせが見える
    await expect(page.getByText("佐藤太郎")).toBeVisible();

    // 行クリックで詳細(COM-015)へ
    await page.getByText("佐藤太郎").click();
    await page.waitForURL(/\/mypage\/job-inquiries\/[0-9a-f-]+$/);

    await expect(page.getByText("ぜひ一度お話を聞かせてください")).toBeVisible();
    await expect(
      page.getByText("求人について話を聞きたい、その他"),
    ).toBeVisible();
    // 送信者メールは mailto ハイパーリンク
    await expect(
      page.locator('a[href="mailto:sato@example.com"]'),
    ).toBeVisible();
  });

  test("法人担当者: 組織共有受信箱で同じ問い合わせが見える", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);

    await page.getByRole("link", { name: "求人へのお問い合わせ" }).click();
    await page.waitForURL(/\/mypage\/job-inquiries$/);
    await expect(page.getByText("佐藤太郎")).toBeVisible();
  });

  test("自社発注者の CON-006 ではボタンが表示されない（same_org）", async ({
    page,
  }) => {
    // staff は org 55555555 のメンバー。owner=鈴木工務店 は自社のため送信不可
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/clients/${CLIENT_ID}`);
    await expect(
      page.getByRole("heading", { name: "鈴木工務店株式会社" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "求人へのお問い合わせ" }),
    ).toHaveCount(0);
  });

  test("連投制限到達時はエラートーストを表示する", async ({ page }) => {
    // contractor2 は直近1時間で5件送信済み（seed）。6件目は拒否される
    await login(page, TEST_CONTRACTOR2.email, TEST_CONTRACTOR2.password);
    await page.goto(`/clients/${CLIENT_ID}`);

    await page.getByRole("link", { name: "求人へのお問い合わせ" }).click();
    await page.waitForURL(/\/inquiry$/);

    await page.getByRole("checkbox", { name: "その他" }).click();
    await page.getByRole("button", { name: "送信する" }).click();

    await expect(page.getByText(/送信回数の上限に達しました/)).toBeVisible();
  });
});
