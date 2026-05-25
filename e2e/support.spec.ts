import { expect, test, type Page } from "@playwright/test";

import { login, TEST_CONTRACTOR } from "./helpers";

/**
 * support spec E2E（COM-008 お問い合わせ / COM-012 トラブル報告）。
 * - お問い合わせ: 匿名で全項目入力＋添付＋送信→完了 / ログイン中でも送信可
 * - トラブル報告: ログイン→氏名・メールのプリフィル確認→入力＋添付＋送信→完了
 * - 導線: マイページ→トラブル報告クリックで到達
 * shadcn Select は #id クリック→option クリックの2段操作。添付は in-memory buffer。
 */

// 最小の PNG バイト列（size>0 / type image/png / 拡張子 png を満たせばよい）
const PNG_ATTACHMENT = {
  name: "shiryo.png",
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

async function pickSelect(page: Page, triggerId: string, optionName: string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

test.describe("お問い合わせ（COM-008）", () => {
  test("匿名で全項目入力＋添付＋送信→完了画面", async ({ page }) => {
    await page.goto("/contact");

    await page.locator("#companyName").fill("匿名テスト工務店");
    await page.locator("#name").fill("匿名太郎");
    await page.locator("#phone").fill("09011112222");
    await page.locator("#email").fill("anon-e2e@test.local");
    await page.locator("#address").fill("東京都港区");

    await pickSelect(page, "inquiryType", "料金について");
    await pickSelect(page, "purpose", "仕事を依頼したい");
    await pickSelect(page, "industry", "大工");
    await pickSelect(page, "videoConsultation", "相談したい");

    await page.locator("#projectDescription").fill("外壁塗装一式");
    await page.locator("#projectArea").fill("東京都内");
    await page.locator("#detail").fill("見積もりについて相談したいです。");

    await page.locator("#attachments").setInputFiles(PNG_ATTACHMENT);

    await page.getByRole("button", { name: "送信する" }).click();

    await expect(
      page.getByText("お問い合わせを受け付けました。"),
    ).toBeVisible();
  });

  test("ログイン中でも送信できる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/contact");

    await page.locator("#companyName").fill("ログインテスト工務店");
    await page.locator("#name").fill("田中一郎");
    await page.locator("#phone").fill("09033334444");
    await page.locator("#email").fill("loggedin-e2e@test.local");

    await pickSelect(page, "inquiryType", "仕事掲載");
    await pickSelect(page, "purpose", "協力会社を探したい");
    await pickSelect(page, "industry", "電気");

    await page.locator("#detail").fill("掲載方法を教えてください。");

    await page.getByRole("button", { name: "送信する" }).click();

    await expect(
      page.getByText("お問い合わせを受け付けました。"),
    ).toBeVisible();
  });
});

test.describe("トラブル報告（COM-012）", () => {
  test("ログイン→プリフィル確認→入力＋添付＋送信→完了", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/trouble-report");

    // 氏名・メールが登録値でプリフィルされている（同期待ち）。
    // 氏名は他 spec（profile.spec）が共有 DB 上で変更しうるため値を固定せず非空のみ検証する。
    // メールは変更されない安定値なので厳密に検証する。
    await expect(page.locator("#reporterName")).not.toHaveValue("");
    await expect(page.locator("#email")).toHaveValue("contractor@test.local");

    await page.locator("#counterpartyName").fill("鈴木次郎");
    await pickSelect(page, "category", "支払いトラブル");
    await page
      .locator("#content")
      .fill("報酬の支払いが滞っています。対応をお願いします。");

    await page.locator("#attachments").setInputFiles(PNG_ATTACHMENT);

    await page.getByRole("button", { name: "送信する" }).click();

    await expect(
      page.getByText("トラブル報告を受け付けました。"),
    ).toBeVisible();
  });

  test("マイページ→トラブル報告クリックで到達できる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/mypage");

    await page.getByRole("link", { name: "トラブル報告" }).click();
    await expect(page).toHaveURL(/\/trouble-report$/);
    await expect(
      page.getByRole("heading", { name: "トラブル報告" }),
    ).toBeVisible();
  });
});
