import { expect, test, type Page } from "@playwright/test";

import { login, TEST_CLIENT } from "./helpers";

/**
 * 発注者詳細（CON-006）で自分自身のページを開ける（2026-10-01 変更）。
 *
 * 発注者一覧（CON-005）には自分も表示されるため、「詳細をみる」で自分のページを開ける。
 * 以前は自分のページが 404 で、一覧から押すと「見つかりません」になっていた。
 * 自分のページでは「メッセージを送る」「マイリスト登録」「求人へのお問い合わせ」を出さない。
 * 他の発注者のページはこれまでどおり（ボタンが出る）。
 */

// 鈴木工務店株式会社（client@test.local、法人プラン owner）
const SELF_CLIENT_ID = "22222222-2222-2222-2222-222222222222";
// 別の発注者（補償 五郎・corp-comp@test.local）
const OTHER_CLIENT_ID = "b1110000-0000-1000-8000-000000000005";

// 発注者のマイリストボタンの数 = 画面全体のマイリストボタン − 「掲載中の案件」カード内のボタン
// （案件カードにも同じ名前のボタンがあるため、差で数える）
async function countClientFavoriteButtons(page: Page): Promise<number> {
  const name = /マイリスト(登録|解除)/;
  const all = await page.getByRole("button", { name }).count();
  const inJobs = await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "掲載中の案件" }) })
    .getByRole("button", { name })
    .count();
  return all - inJobs;
}

test.describe("発注者詳細: 自分のページ", () => {
  test("マイページ → 発注者一覧 → 自分の「詳細をみる」で自分のページが開き、操作ボタンは出ない", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    await page.getByRole("link", { name: "発注者一覧" }).click();
    await page.waitForURL(/\/clients(\?.*)?$/);

    await page.locator(`a[href="/clients/${SELF_CLIENT_ID}"]`).first().click();
    await page.waitForURL(new RegExp(`/clients/${SELF_CLIENT_ID}$`));

    await expect(page.getByRole("heading", { name: "発注者詳細" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "鈴木工務店株式会社" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "基本情報" })).toBeVisible();

    await expect(page.getByRole("link", { name: "メッセージを送る" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "求人へのお問い合わせ" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "掲載中の案件" })).toBeVisible();
    expect(await countClientFavoriteButtons(page)).toBe(0);
  });

  test("自分宛てのメッセージ作成画面は URL を直接開いても表示されない", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    const res = await page.goto(`/messages/new?to=${SELF_CLIENT_ID}`);
    expect(res?.status()).toBe(404);
  });

  test("他の発注者のページはこれまでどおり「メッセージを送る」「マイリスト登録」が出る", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/clients/${OTHER_CLIENT_ID}`);

    await expect(page.getByRole("heading", { name: "発注者詳細" })).toBeVisible();
    await expect(page.getByRole("link", { name: "メッセージを送る" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "掲載中の案件" })).toBeVisible();
    expect(await countClientFavoriteButtons(page)).toBe(1);
  });
});
