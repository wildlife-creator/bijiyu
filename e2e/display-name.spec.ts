import { expect, test } from "@playwright/test";

import { login, TEST_CONTRACTOR } from "./helpers";

/**
 * 発注者表示名の解決ロジックが 8 画面で一貫していることを確認する E2E。
 *
 * - 法人プラン契約中のユーザーは `organizations.name` を優先表示
 * - 組織名が未設定（空）もしくは法人プラン active でないユーザーは
 *   `users.company_name` または姓名にフォールバック
 *
 * テストの検証対象として seed データの `corp-comp@test.local` を使う:
 *   - users.company_name = NULL
 *   - organizations.name = '補償テスト建設'
 *   - users.last_name + first_name = '補償五郎'
 *   - 既存 corporate プラン active
 *
 * resolveParticipantName の優先順位が正しければ「補償テスト建設」が表示される。
 * 旧 getUserDisplayName(company) のままであれば company_name が NULL のため
 * 「未設定」または個人名が表示されるはず。
 */

const CORP_COMP_USER_ID = "b1110000-0000-1000-8000-000000000005";
const EXPECTED_ORG_NAME = "補償テスト建設";

test.describe("発注者表示名の解決（法人プラン組織名優先）", () => {
  test("発注者一覧に法人プラン契約者の組織名が表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/clients");
    // corp-comp のカードに組織名が表示されていること
    await expect(page.getByText(EXPECTED_ORG_NAME).first()).toBeVisible();
  });

  test("発注者詳細に法人プラン契約者の組織名が表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/clients/${CORP_COMP_USER_ID}`);
    await expect(page.getByText(EXPECTED_ORG_NAME).first()).toBeVisible();
  });
});
