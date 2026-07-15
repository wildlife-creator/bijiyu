import { expect, test, type Page } from "@playwright/test";

import { login, TEST_PROXY_MULTI } from "./helpers";

/**
 * N 組織兼任の代理スタッフに対する「アクティブ組織スコープ」の E2E。
 *
 * 背景（2026-07-15 のバグ修正）:
 *   scout_templates / job_inquiries の RLS は「所属している全組織」を許可する
 *   ため、複数組織を兼任する代理スタッフ（proxy-multi）ではアクティブ組織以外
 *   のデータが混ざって見えていた。アプリ層で `getActiveOrganizationContext()`
 *   のアクティブ組織に必ず絞る修正を入れた。この spec はその回帰防止。
 *
 * seed fixtures（supabase/seed.sql の f777 帯）:
 *   * 法人 X (f777a111): スカウトテンプレ「法人 X のスカウトテンプレ」
 *                        + お問い合わせ「法人X宛の問い合わせ送信者」
 *   * 法人 Y (f777b222): スカウトテンプレ「法人 Y のスカウトテンプレ」
 *                        + お問い合わせ「法人Y宛の問い合わせ送信者」
 *   * proxy-multi@test.local は X / Y 両方の代理スタッフ（既定 = 法人 X）
 */

const ORG_SWITCHER_LABEL = "所属組織を切り替える";

const ORG_Y_TEMPLATE_ID = "f777dddd-0002-0002-0002-000000000002";
const ORG_X_TEMPLATE_ID = "f777dddd-0001-0001-0001-000000000001";
const ORG_Y_INQUIRY_ID = "f777ffff-0002-0002-0002-000000000002";
const ORG_X_INQUIRY_ID = "f777ffff-0001-0001-0001-000000000001";

async function switchToOrg(page: Page, displayName: string) {
  await page.getByRole("combobox", { name: ORG_SWITCHER_LABEL }).click();
  await page.getByRole("option", { name: displayName }).click();
  // 切替直前の URL が /mypage/... の場合に waitForURL が即マッチして
  // 切替完了前に先へ進んでしまうため、URL は「/mypage ちょうど」で待ち、
  // さらにスイッチャーの表示が新組織名になるまで待つ
  await page.waitForURL(/\/mypage(\?|$)/);
  await expect(
    page.getByRole("combobox", { name: ORG_SWITCHER_LABEL }),
  ).toContainText(displayName);
}

test.describe("N 組織兼任スタッフ: スカウトテンプレのアクティブ組織スコープ", () => {
  test("一覧・詳細・編集ともアクティブ組織のテンプレのみ。切替で入れ替わる", async ({
    page,
  }) => {
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);
    await page.waitForURL(/\/mypage/);

    // 1. 既定組織（法人 X）: 一覧に X のみ表示され、Y が混ざらない
    await page.goto("/messages/templates");
    await expect(page.getByText("法人 X のスカウトテンプレ")).toBeVisible();
    await expect(page.getByText("法人 Y のスカウトテンプレ")).toHaveCount(0);

    // 2. 法人 X コンテキストのまま、法人 Y テンプレの詳細・編集の直リンクは 404
    const detailRes = await page.goto(
      `/messages/templates/${ORG_Y_TEMPLATE_ID}`,
    );
    expect(detailRes?.status()).toBe(404);
    const editRes = await page.goto(
      `/messages/templates/${ORG_Y_TEMPLATE_ID}/edit`,
    );
    expect(editRes?.status()).toBe(404);

    // 3. 自組織（法人 X）テンプレの詳細は開ける
    await page.goto(`/messages/templates/${ORG_X_TEMPLATE_ID}`);
    await expect(page.getByText("法人 X のテンプレ本文です。")).toBeVisible();

    // 4. 法人 Y に切り替えると一覧が Y のみになり、X 詳細の直リンクが 404 になる
    await switchToOrg(page, TEST_PROXY_MULTI.orgY.displayName);
    await page.goto("/messages/templates");
    await expect(page.getByText("法人 Y のスカウトテンプレ")).toBeVisible();
    await expect(page.getByText("法人 X のスカウトテンプレ")).toHaveCount(0);

    const xDetailRes = await page.goto(
      `/messages/templates/${ORG_X_TEMPLATE_ID}`,
    );
    expect(xDetailRes?.status()).toBe(404);
  });
});

test.describe("N 組織兼任スタッフ: 求人お問い合わせ受信箱のアクティブ組織スコープ", () => {
  test("受信箱・詳細ともアクティブ組織宛のみ。切替で入れ替わる", async ({
    page,
  }) => {
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);
    await page.waitForURL(/\/mypage/);

    // 1. 既定組織（法人 X）: 受信箱に X 宛のみ表示され、Y 宛が混ざらない
    await page.goto("/mypage/job-inquiries");
    await expect(page.getByText("法人X宛の問い合わせ送信者")).toBeVisible();
    await expect(page.getByText("法人Y宛の問い合わせ送信者")).toHaveCount(0);

    // 2. 法人 X コンテキストのまま、法人 Y 宛お問い合わせ詳細の直リンクは 404
    const detailRes = await page.goto(`/mypage/job-inquiries/${ORG_Y_INQUIRY_ID}`);
    expect(detailRes?.status()).toBe(404);

    // 3. 自組織（法人 X）宛の詳細は開ける
    await page.goto(`/mypage/job-inquiries/${ORG_X_INQUIRY_ID}`);
    await expect(
      page.getByText("法人 X 宛のお問い合わせ内容です。"),
    ).toBeVisible();

    // 4. 法人 Y に切り替えると受信箱が Y 宛のみになり、X 宛詳細の直リンクが 404 になる
    await switchToOrg(page, TEST_PROXY_MULTI.orgY.displayName);
    await page.goto("/mypage/job-inquiries");
    await expect(page.getByText("法人Y宛の問い合わせ送信者")).toBeVisible();
    await expect(page.getByText("法人X宛の問い合わせ送信者")).toHaveCount(0);

    const xDetailRes = await page.goto(
      `/mypage/job-inquiries/${ORG_X_INQUIRY_ID}`,
    );
    expect(xDetailRes?.status()).toBe(404);
  });
});
