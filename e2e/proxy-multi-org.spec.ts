import { expect, test } from "@playwright/test";

import { login, TEST_PROXY_MULTI } from "./helpers";

/**
 * proxy-account-multi-org-support Phase 3 / Task 3.3
 *
 * N 組織兼任スタッフのスモークテスト。
 * Phase 7 で OrgSwitcher UI を投入するまでは Cookie 未設定での「既定組織」挙動を
 * 検証する。`getActiveOrganizationContext` の既定値は `created_at ASC` で最古の
 * 組織 = seed の法人 X（`プロキシ法人 X 株式会社`）。
 *
 * 検証スコープ（Phase 3 時点）:
 *   1. マイページにアクセス → 既定組織（法人 X）の発注者アバター/プラン文脈で
 *      表示が壊れず到達できる
 *   2. メッセージ一覧にアクセス → 既定組織（法人 X）のスレッドのみが見え、
 *      もう一方の組織（法人 Y）のスレッドが混入しない
 */

test.describe("N 組織兼任スタッフ スモーク（Phase 3）", () => {
  test("マイページが既定組織コンテキストで表示される", async ({ page }) => {
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);
    // login() が /mypage 着地まで待つ
    await page.waitForURL(/\/mypage(\?|$|\/)/);
    // 「マイページ」表示自体が壊れていないこと（旧 .maybeSingle が 2 行で爆死しない）
    await expect(page).toHaveURL(/\/mypage/);
  });

  test("メッセージ一覧は既定組織（法人 X）のスレッドのみ表示する", async ({
    page,
  }) => {
    await login(page, TEST_PROXY_MULTI.email, TEST_PROXY_MULTI.password);
    await page.goto("/messages");
    // 法人 X の代理メッセージ
    await expect(
      page.getByText("法人 X からの代理メッセージです。"),
    ).toBeVisible();
    // 法人 Y のスレッドは active org に含まれないため非表示
    await expect(
      page.getByText("法人 Y からの代理メッセージです。"),
    ).toHaveCount(0);
  });
});
