import { expect, test } from "@playwright/test";

import { TEST_CONTRACTOR3, login } from "./helpers";

/**
 * BackButton 暗黙 submit 回帰防止
 *
 * 2026-05-18 に発見されたバグの回帰防止テスト。
 * `<form>` 内の `<button>` は HTML 仕様で type="submit" が既定。
 * BackButton 等のナビゲーション目的のボタンに `type="button"` を
 * 明示し忘れると、ユーザーが「もどる」をクリックしただけで
 * フォーム送信 (handleFormSubmit → updateProfileAction) が発火し、
 * 意図せず DB が更新される。
 *
 * このテストは:
 *   - contractor3 が保有する「特級ボイラー技士（廃止）」chip を × で削除（UI のみ）
 *   - 「もどる」をクリック (type="button" なら submit しない)
 *   - /profile を再表示して DB 状態を確認 (特級ボイラー技士 が残っている)
 *
 * BackButton に type="button" が無い場合、× → もどる で chip が DB から消えるため、
 * 最後の expect(getByText("特級ボイラー技士")) が失敗してバグを検出する。
 */
test.describe("BackButton 暗黙 submit 回帰防止", () => {
  test("フォーム内で chip × → 「もどる」だけでは Server Action が発火せず DB が変更されない", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR3.email, TEST_CONTRACTOR3.password);

    // Setup: 初期状態確認 — contractor3 は「特級ボイラー技士」(seed deprecated) を保有
    await page.goto("/profile");
    await expect(
      page.getByText("特級ボイラー技士", { exact: true }),
    ).toBeVisible();

    // Action: /profile/edit で chip × → 「もどる」
    await page.goto("/profile/edit");
    await expect(page.getByText("特級ボイラー技士（廃止）")).toBeVisible();

    // chip の × ボタン (role="button", aria-label="<label> を削除")
    // exact: true で外側の MasterCombobox トリガーボタン (accessible name に chip 名が連結される) を除外
    await page
      .getByRole("button", {
        name: "特級ボイラー技士（廃止） を削除",
        exact: true,
      })
      .click();

    // フォーム state から chip が消えた (UI レベル)
    await expect(page.getByText("特級ボイラー技士（廃止）")).toHaveCount(0);

    // 「もどる」ボタン (BackButton) を押下
    // ── type="button" でない場合、ここで暗黙 submit が発火する
    await page.getByRole("button", { name: "もどる" }).click();

    // ナビゲーション完了を待つ (router.back() で /profile 等へ)
    await page.waitForURL((url) => !url.pathname.endsWith("/edit"));

    // Assert: /profile を再表示して DB 状態を確認
    // 「特級ボイラー技士」chip がまだ保有資格に残っている (DB 不変)
    await page.goto("/profile");
    await expect(
      page.getByText("特級ボイラー技士", { exact: true }),
    ).toBeVisible();
  });
});
