import { expect, test } from "@playwright/test";

import { login, TEST_CONTRACTOR, TEST_PROXY_MULTI } from "./helpers";

/**
 * proxy-account-multi-org-support Phase 7 / Task 7.4
 *
 * `OrgSwitcher` + `setActiveOrganizationContext` の E2E。
 *
 * 検証スコープ:
 *   1. 単一組織ユーザー（contractor）には DOM 出力されない
 *   2. N 組織兼任スタッフ（proxy-multi）には常に表示される
 *   3. 組織スコープ URL（`/messages`）から OrgSwitcher で切替 → `/mypage` に着地し、
 *      切替後にメッセージ一覧が新組織のスレッドだけになる
 *   4. URL 改竄相当（不正な orgId Cookie）に対して、既定組織（最古）に
 *      安全にフォールバックする
 *
 * 要件: 7.1, 7.2, 7.3, 7.4
 */

const ORG_SWITCHER_LABEL = "所属組織を切り替える";

test.describe("OrgSwitcher (Phase 7)", () => {
  test("単一組織ユーザーには OrgSwitcher が DOM 出力されない", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.waitForURL(/\/mypage/);
    await expect(
      page.getByRole("combobox", { name: ORG_SWITCHER_LABEL }),
    ).toHaveCount(0);
    await expect(page.locator('[data-testid="org-switcher"]')).toHaveCount(0);
  });

  test("N 組織兼任スタッフには OrgSwitcher が表示される", async ({ page }) => {
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);
    await page.waitForURL(/\/mypage/);
    await expect(
      page.getByRole("combobox", { name: ORG_SWITCHER_LABEL }),
    ).toBeVisible();
  });

  test("組織スコープ URL からの切替で /mypage に固定遷移しデータが切り替わる", async ({
    page,
  }) => {
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);

    // 1. 既定組織（法人 X）のメッセージ一覧へ移動
    await page.goto("/messages");
    await expect(
      page.getByText("法人 X からの代理メッセージです。"),
    ).toBeVisible();
    await expect(
      page.getByText("法人 Y からの代理メッセージです。"),
    ).toHaveCount(0);

    // 2. 組織スコープ URL で OrgSwitcher を開き法人 Y へ切替
    const trigger = page.getByRole("combobox", { name: ORG_SWITCHER_LABEL });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page
      .getByRole("option", { name: TEST_PROXY_MULTI.orgY.displayName })
      .click();

    // 3. 切替後は常に /mypage に着地（組織スコープ URL のままリロードしない）
    await page.waitForURL(/\/mypage(\?|$|\/)/);
    await expect(page).toHaveURL(/\/mypage/);

    // 4. 改めて /messages を開くと法人 Y のスレッドだけになる
    await page.goto("/messages");
    await expect(
      page.getByText("法人 Y からの代理メッセージです。"),
    ).toBeVisible();
    await expect(
      page.getByText("法人 X からの代理メッセージです。"),
    ).toHaveCount(0);

    // 5. 法人 X に戻しても同じ仕組みで動くことを念のため確認
    await page
      .getByRole("combobox", { name: ORG_SWITCHER_LABEL })
      .click();
    await page
      .getByRole("option", { name: TEST_PROXY_MULTI.orgX.displayName })
      .click();
    await page.waitForURL(/\/mypage(\?|$|\/)/);
    await page.goto("/messages");
    await expect(
      page.getByText("法人 X からの代理メッセージです。"),
    ).toBeVisible();
  });

  test("不正な orgId Cookie は既定組織にフォールバックする", async ({
    page,
    context,
  }) => {
    // ログイン後に Cookie を改竄（実在しない UUID）
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);

    const pageUrl = new URL(page.url());
    await context.addCookies([
      {
        name: "bizyu_active_org",
        value: "deadbeef-dead-beef-dead-beefdeadbeef",
        domain: pageUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // 既定組織（法人 X、created_at 最古）にフォールバックすることを確認
    await page.goto("/messages");
    await expect(
      page.getByText("法人 X からの代理メッセージです。"),
    ).toBeVisible();
    await expect(
      page.getByText("法人 Y からの代理メッセージです。"),
    ).toHaveCount(0);
  });
});
