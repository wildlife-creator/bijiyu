import { test, expect } from "@playwright/test";

import { login, TEST_STAFF, TEST_CLIENT } from "./helpers";

/**
 * job_images RLS が組織対応済みかを通しフローで確認する回帰防止テスト。
 *
 * 背景 (2026-07-07 手動テストで発見):
 *   - Staff が案件を作成 (owner_id=Staff, organization_id=org)
 *   - Staff が 1 枚目の画像を追加 → 成功 (owner_id = auth.uid())
 *   - Owner が同じ案件を編集で開き 2 枚目の画像を追加 → Storage には
 *     書き込まれるが job_images テーブルへの INSERT が RLS silent block
 *     (jobs.owner_id=Staff != auth.uid()=Owner) されて公開後に画像が出ない
 *   - 削除も同じパターンでブロックされうる
 *
 * 修正: 20260707130000_job_images_org_aware_rls.sql で INSERT/UPDATE/DELETE を
 *      `owner_id = auth.uid() OR is_same_org(...)` に拡張。
 *
 * このテストは:
 *   1. Staff が案件を作って 1 枚追加できる
 *   2. Staff が追加した画像を削除できる
 *   3. Staff が同じ案件に 2 枚を追加して詳細画面で両方見える
 *   4. Owner (同組織) が Staff 作成案件にも画像を追加できる (組織対応)
 */

// 最小の PNG バイト列（size>0 / type image/png を満たせばよい）
const PNG_FIXTURE_1 = {
  name: "staff-image-1.png",
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
};
const PNG_FIXTURE_2 = {
  name: "staff-image-2.png",
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02]),
};

test.describe("担当者による案件画像の追加・削除 (job_images RLS 組織対応)", () => {
  test("Staff が案件を作成 → 画像1枚追加 → 削除 → 2枚追加 → 詳細で両方見える", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);

    // ---- 1. 案件を作って ID を確保 ----
    await page.goto("/jobs/create");
    const title = `E2E 画像テスト ${Date.now()}`;
    await page.getByPlaceholder("案件タイトルを入力").fill(title);
    await page.getByRole("button", { name: "下書き保存" }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]+\?manage=true/);
    const detailUrl = page.url();
    const jobId = detailUrl.match(/\/jobs\/([0-9a-f-]+)\?/)?.[1];
    if (!jobId) throw new Error("jobId 取得失敗");

    // ---- 2. 編集 → 1 枚追加 → 下書き保存 ----
    await page.goto(`/jobs/${jobId}/edit`);
    await expect(
      page.getByRole("heading", { name: "募集現場編集" }),
    ).toBeVisible();

    // 画像アップローダーの hidden input は複数あるが、setInputFiles は
    // 最初に見えるものを掴めば OK (0 枚時は 1 個目の "画像を登録する" のみ表示)
    await page.locator('input[type="file"]').first().setInputFiles(PNG_FIXTURE_1);

    // 「1/10枚」表示になるまで待つ
    await expect(page.getByText("1/10枚")).toBeVisible();

    await page.getByRole("button", { name: "下書き保存" }).click();
    await expect(page.getByText("案件を更新しました")).toBeVisible();
    await page.waitForURL(new RegExp(`/jobs/${jobId}\\?manage=true`));

    // ---- 3. 編集 → 追加した画像を削除 → 保存 → 詳細で消えている ----
    await page.goto(`/jobs/${jobId}/edit`);
    // 既存画像プレビューが 1 個ある
    const existingImage = page.locator("img[alt=\"案件画像\"]").first();
    await expect(existingImage).toBeVisible();

    // 削除ボタン (× アイコン) は group-hover で opacity 0→100 になる。
    // Playwright は force: true で非表示要素でもクリック可能。
    // 削除ボタンは既存画像プレビュー内の button (aria-label 未設定なので位置で特定)。
    const deleteButtons = page.locator(
      "img[alt=\"案件画像\"] + button, img[alt=\"案件画像\"] ~ button",
    );
    await deleteButtons.first().click({ force: true });

    // 削除トースト
    await expect(page.getByText("画像を削除しました")).toBeVisible();
    // カウンターが 0 に戻る
    await expect(page.getByText("0/10枚")).toBeVisible();

    // ---- 4. 2 枚を一度に追加 → 保存 → 詳細で両方見える ----
    await page.locator('input[type="file"]').first().setInputFiles([
      PNG_FIXTURE_1,
      PNG_FIXTURE_2,
    ]);
    await expect(page.getByText("2/10枚")).toBeVisible();

    await page.getByRole("button", { name: "下書き保存" }).click();
    await expect(page.getByText("案件を更新しました")).toBeVisible();
    await page.waitForURL(new RegExp(`/jobs/${jobId}\\?manage=true`));

    // 詳細画面（管理ビューではなく通常の受注者ビュー相当）の Images セクションで
    // <SafeImage> が 2 個描画されているか
    await page.goto(`/jobs/${jobId}`);
    // 案件画像 img が 2 個表示される
    await expect(page.locator("img[alt=\"案件画像\"]")).toHaveCount(2);
  });

  test("Owner が Staff 作成案件に画像を追加できる (組織対応 RLS)", async ({
    page,
  }) => {
    // Staff が案件を作る
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/jobs/create");
    const title = `E2E Owner 追加テスト ${Date.now()}`;
    await page.getByPlaceholder("案件タイトルを入力").fill(title);
    await page.getByRole("button", { name: "下書き保存" }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]+\?manage=true/);
    const jobId = page.url().match(/\/jobs\/([0-9a-f-]+)\?/)?.[1];
    if (!jobId) throw new Error("jobId 取得失敗");

    // Owner に切り替え (cookie を消して再ログイン)
    await page.context().clearCookies();
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    // Owner が Staff 作成案件の編集画面へ (組織メンバーなので入れる)
    await page.goto(`/jobs/${jobId}/edit`);
    await expect(
      page.getByRole("heading", { name: "募集現場編集" }),
    ).toBeVisible();

    // 画像 1 枚追加
    await page.locator('input[type="file"]').first().setInputFiles(PNG_FIXTURE_1);
    await expect(page.getByText("1/10枚")).toBeVisible();

    await page.getByRole("button", { name: "下書き保存" }).click();
    await expect(page.getByText("案件を更新しました")).toBeVisible();
    await page.waitForURL(new RegExp(`/jobs/${jobId}\\?manage=true`));

    // 詳細で 1 枚見える (RLS 修正前は Storage には書けても job_images 挿入が
    // silent block されて 0 枚のままだった)
    await page.goto(`/jobs/${jobId}`);
    await expect(page.locator("img[alt=\"案件画像\"]")).toHaveCount(1);
  });
});
