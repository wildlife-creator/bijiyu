import { expect, test } from "@playwright/test";

import { login, TEST_CONTRACTOR } from "./helpers";

/**
 * 発注者表示名の解決ロジックが受注者から発注者を見る画面で一貫していることを
 * 確認する E2E。
 *
 * 新仕様（organization spec 完了後）: 表示名は `client_profiles.display_name` に
 * 一本化されている。`display_name` 未設定の場合は `users.last_name + first_name`
 * にフォールバックし、退会済みユーザーは「退会済みユーザー」を返す。
 *
 * 検証対象: seed データの `corp-comp@test.local`
 *   - client_profiles.display_name = '補償テスト建設'（旧 organizations.name から
 *     Task 7.1 で継承）
 *   - users.last_name + first_name = '補償五郎'
 *   - 既存 corporate プラン active
 *
 * resolveParticipantName + resolveClientProfileForRow が正しければ
 * 「補償テスト建設」が表示される。
 */

const CORP_COMP_USER_ID = "b1110000-0000-1000-8000-000000000005";
const EXPECTED_DISPLAY_NAME = "補償テスト建設";

test.describe("発注者表示名の解決（client_profiles.display_name 一本化）", () => {
  test("発注者一覧に client_profiles.display_name が表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/clients");
    // corp-comp のカードに display_name が表示されていること
    await expect(page.getByText(EXPECTED_DISPLAY_NAME).first()).toBeVisible();
  });

  test("発注者詳細に client_profiles.display_name が表示される", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/clients/${CORP_COMP_USER_ID}`);
    await expect(page.getByText(EXPECTED_DISPLAY_NAME).first()).toBeVisible();
  });
});
