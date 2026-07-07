import { test, expect } from "@playwright/test";
import { login, TEST_STAFF, TEST_STAFF_ADMIN } from "./helpers";

/**
 * 担当者（Staff / Admin org_role）による案件作成の回帰防止テスト。
 *
 * 背景: 案件作成 Server Action の subscription チェックが操作者本人の
 * user_id で行われていたため、Owner のサブスクに相乗りする Staff が
 * 「有効なサブスクリプションがありません。プランに加入してください。」
 * エラーで案件を保存できないバグがあった。
 * resolveEffectiveSubscription 経由に一本化して修正。
 *
 * このテストは:
 *   1. 普通の担当者（org_role=staff = staff@test.local）
 *   2. 強い担当者（org_role=admin = staff-admin@test.local）
 * のそれぞれで「マイページ → 発注先を管理する → 募集現場一覧 → 新規作成
 * → タイトル入力 → 下書き保存 → 成功」までを通しで確認する。
 *
 * CLAUDE.md「E2Eテスト」の「page.goto 直接遷移だけで完結させない」
 * ルールに従い、少なくとも 1 ケースはマイページからクリックで導線を辿る。
 */
test.describe("担当者による案件作成（Staff subscription 回帰防止）", () => {
  test("普通の担当者（org_role=staff）はマイページから案件を下書き保存できる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);

    // マイページに到達
    await expect(
      page.getByRole("heading", { name: "マイページ" }),
    ).toBeVisible();

    // 「発注先を管理する」セクション（法人プランの Staff が閲覧可能）
    await expect(
      page.getByRole("heading", { name: "発注先を管理する" }),
    ).toBeVisible();

    // 募集現場一覧に遷移（CLI-001）
    await page.getByRole("link", { name: "募集現場一覧" }).click();
    await page.waitForURL(/\/jobs\/manage/);
    await expect(
      page.getByRole("heading", { name: "募集現場一覧" }),
    ).toBeVisible();

    // 新規作成ボタン → 案件作成フォームへ
    await page.getByRole("link", { name: "新規作成" }).click();
    await page.waitForURL(/\/jobs\/create/);
    await expect(
      page.getByRole("heading", { name: "募集現場新規登録" }),
    ).toBeVisible();

    // 下書き保存は「タイトル」だけあれば通る（jobDraftSchema）
    const title = `E2E Staff 作成テスト ${Date.now()}`;
    await page.getByPlaceholder("案件タイトルを入力").fill(title);

    await page.getByRole("button", { name: "下書き保存" }).click();

    // 修正前は「有効なサブスクリプションがありません」トーストで失敗していた。
    // 修正後は Owner の corporate プランに相乗りして成功トースト + 詳細遷移。
    await expect(page.getByText("案件を作成しました")).toBeVisible();
    await page.waitForURL(/\/jobs\/[0-9a-f-]+\?manage=true/);
    await expect(page.getByText(title)).toBeVisible();
  });

  test("強い担当者（org_role=admin）も案件を下書き保存できる", async ({ page }) => {
    // Admin は同じフローが通ることを確認できれば十分（マイページ導線は
    // Staff ケースで検証済み）。/jobs/create に直接遷移して save のみ確認する。
    await login(page, TEST_STAFF_ADMIN.email, TEST_STAFF_ADMIN.password);
    await page.goto("/jobs/create");
    await expect(
      page.getByRole("heading", { name: "募集現場新規登録" }),
    ).toBeVisible();

    const title = `E2E Admin 作成テスト ${Date.now()}`;
    await page.getByPlaceholder("案件タイトルを入力").fill(title);

    await page.getByRole("button", { name: "下書き保存" }).click();

    await expect(page.getByText("案件を作成しました")).toBeVisible();
    await page.waitForURL(/\/jobs\/[0-9a-f-]+\?manage=true/);
  });
});
