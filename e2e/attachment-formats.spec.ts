import { expect, test } from "@playwright/test";

import { login, TEST_CLIENT, TEST_CONTRACTOR } from "./helpers";

/**
 * スマホ写真対応 (HEIC 自動変換 / WebP / PDF) の回帰防止 E2E。
 *
 * 背景:
 *   iPhone の HEIC 写真はブラウザ側 (heic2any / WASM) で JPEG に変換してから
 *   アップロードする。実ブラウザで変換が走ることと、PDF が「PDFを開く」リンクで
 *   表示されることを、実 HEIC / PDF ファイルで通しで確認する。
 *   変換ロジック単体は src/__tests__/storage/image-convert.test.ts が担保する。
 *
 * フィクスチャ (e2e/fixtures/):
 *   - sample.heic : sips で生成した実 HEIC 画像
 *   - sample.pdf  : 最小の有効な PDF
 */
const HEIC_FIXTURE = "e2e/fixtures/sample.heic";
const PDF_FIXTURE = "e2e/fixtures/sample.pdf";

function isUploadTo(url: string, bucket: string, ext: string): boolean {
  return (
    new RegExp(`/storage/v1/object/${bucket}/`).test(url) &&
    new RegExp(`\\.${ext}(\\?|$)`).test(url)
  );
}

test("アバター: HEIC を選ぶとブラウザで JPEG に変換されてアップロードされる", async ({
  page,
}) => {
  await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  await page.goto("/profile/edit");
  await expect(
    page.getByRole("button", { name: /画像を登録する/ }),
  ).toBeVisible({ timeout: 20000 });

  // .heic を渡したのに avatars へ .jpg が POST される = 実ブラウザで
  // heic2any による HEIC→JPEG 変換が走った決定的な証拠
  const jpgUpload = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && isUploadTo(r.url(), "avatars", "jpg"),
    { timeout: 45000 },
  );
  await page.locator('input[type="file"]').first().setInputFiles(HEIC_FIXTURE);
  const resp = await jpgUpload;
  expect(resp.status()).toBeLessThan(300);

  await expect(page.getByText("画像を変換できませんでした")).toHaveCount(0);
  const avatar = page.getByRole("img", { name: "プロフィール画像" });
  await expect(avatar).toBeVisible({ timeout: 30000 });
  await expect(avatar).toHaveAttribute("src", /avatars/, { timeout: 30000 });
});

test("案件画像: HEIC は JPEG 変換 / PDF は『PDFを開く』リンクで表示される", async ({
  page,
}) => {
  await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

  // 案件を下書き作成
  await page.goto("/jobs/create");
  await page
    .getByPlaceholder("案件タイトルを入力")
    .fill(`E2E 添付形式テスト ${Date.now()}`);
  await page.getByRole("button", { name: "下書き保存" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]+\?manage=true/);
  const jobId = page.url().match(/\/jobs\/([0-9a-f-]+)\?/)?.[1];
  if (!jobId) throw new Error("jobId 取得失敗");

  // 編集画面で HEIC + PDF を添付
  await page.goto(`/jobs/${jobId}/edit`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([HEIC_FIXTURE, PDF_FIXTURE]);
  await expect(page.getByText("2/10枚")).toBeVisible({ timeout: 20000 });

  // 保存 → job-attachments へ .jpg (変換後) と .pdf が POST
  const jpgUpload = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      isUploadTo(r.url(), "job-attachments", "jpg"),
    { timeout: 45000 },
  );
  const pdfUpload = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      isUploadTo(r.url(), "job-attachments", "pdf"),
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "下書き保存" }).click();
  expect((await jpgUpload).status()).toBeLessThan(300);
  expect((await pdfUpload).status()).toBeLessThan(300);
  await expect(page.getByText("案件を更新しました")).toBeVisible({
    timeout: 20000,
  });

  // 詳細ギャラリーで PDF が「PDFを開く」リンクで表示される
  await page.goto(`/jobs/${jobId}?manage=true`);
  await expect(
    page.getByRole("link", { name: "PDFを開く" }).first(),
  ).toBeVisible({ timeout: 15000 });
});
