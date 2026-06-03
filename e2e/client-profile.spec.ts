import { expect, test } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_CONTRACTOR,
  TEST_INDIVIDUAL_CLIENT,
  TEST_STAFF,
} from "./helpers";

/**
 * organization spec Task 17.2: 発注者プロフィール E2E
 *
 * CLI-020 詳細表示 / CLI-021 編集 + setup モード / Staff 閲覧のみ /
 * 受注者視点での display_name 表示。
 *
 * 画像アップロードはバックエンドモック（Inbucket / Supabase Storage の
 * 実挙動）を含み Playwright 単独では難しいため、Vitest 統合テストで
 * カバー（Task 10.1 の uploadClientProfileImageAction テスト参照）。
 */

// ---------------------------------------------------------------------------
// CLI-020 詳細表示
// ---------------------------------------------------------------------------
test.describe("CLI-020 発注者情報詳細", () => {
  test("Owner で自組織の client_profiles を表示", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
    // seed 「鈴木工務店株式会社」が display_name として表示される
    await expect(page.getByText("鈴木工務店株式会社")).toBeVisible();
    // 「担当者を確認する」ボタン（法人プラン）
    await expect(
      page.getByRole("link", { name: "担当者を確認する" }),
    ).toBeVisible();
    // 「編集する」ボタン（Owner は表示可）
    await expect(page.getByRole("link", { name: "編集する" })).toBeVisible();
  });

  test("Staff は閲覧のみ / 編集ボタン非表示", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
    // Staff には「編集する」ボタンが非表示
    await expect(page.getByRole("link", { name: "編集する" })).toHaveCount(0);
  });

  test("個人プランは「担当者を確認する」ボタン非表示", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "担当者を確認する" }),
    ).toHaveCount(0);
  });

  // client-review-completion: 評判表示（また仕事を受けたい good／合計）
  test("評判あり: また仕事を受けたい（good／合計）を表示する", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
    // seed: 22222222 への client_reviews は good 3件 + bad 1件 = 「3／4件」
    await expect(page.getByText("・また仕事を受けたい")).toBeVisible();
    await expect(page.getByText("（3／4件）")).toBeVisible();
    // 0件メッセージは出ない
    await expect(page.getByText("評判はまだありません")).toHaveCount(0);
  });

  test("評価0件: 評判はまだありませんを表示する", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
    // seed: dd111111（中村リフォーム）には client_reviews が無い
    await expect(page.getByText("評判はまだありません")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CLI-021 編集（通常モード）
// ---------------------------------------------------------------------------
test.describe("CLI-021 発注者情報編集（編集モード）", () => {
  test("Owner が display_name を更新 → CLI-020 に反映 → 復元", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/client-profile");
    await page.getByRole("link", { name: "編集する" }).click();
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();

    const original = "鈴木工務店株式会社"; // seed の値
    const newName = `E2E_更新_${Date.now()}`;
    const displayNameInput = page.getByLabel("会社名・氏名");
    // react-hook-form の defaultValue 同期を待ってから入力（待たないと値が連結する）
    await expect(displayNameInput).toHaveValue(original);
    await displayNameInput.fill(newName);
    await page.getByRole("button", { name: "保存する" }).click();

    // ハードナビゲーション（window.location.href）後に CLI-020 に到達
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(newName)).toBeVisible();

    // テスト間の状態リーク防止: seed の値に復元
    await page.getByRole("link", { name: "編集する" }).click();
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();
    const restoreInput = page.getByLabel("会社名・氏名");
    // 復元時も同期待ち（編集画面の初期値は今 newName）
    await expect(restoreInput).toHaveValue(newName);
    await restoreInput.fill(original);
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(original)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CLI-021 setup モード
// ---------------------------------------------------------------------------
test.describe("CLI-021 setup モード（課金直後フロー）", () => {
  test("法人プラン Owner が setup モードで社名必須バリデーション", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/client-profile/edit?setup=true");
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();
    // 法人プラン用セットアップバナー
    await expect(page.getByText(/社名の入力が必須です/)).toBeVisible();
    // スキップボタンは法人プランでは非表示
    await expect(
      page.getByRole("button", { name: "スキップして後で設定する" }),
    ).toHaveCount(0);

    // 社名を空にして保存しようとするとエラー
    // （setup モードでは button ラベルが「保存する」）
    // react-hook-form の defaultValues 同期完了を待ってから clear する
    // （fill("") は DOM が一瞬空のタイミングで no-op 化されることがある）
    const displayNameInput = page.getByLabel("会社名・氏名");
    await expect(displayNameInput).toHaveValue("鈴木工務店株式会社");
    await displayNameInput.clear();
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("社名を入力してください")).toBeVisible();
  });

  test("個人プラン setup モードにスキップボタンが表示される", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/mypage/client-profile/edit?setup=true");
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();
    // 非法人プラン用セットアップバナー
    await expect(page.getByText(/受注者機能のみ利用する方はスキップ可/)).toBeVisible();
    // スキップボタンが表示される
    await expect(
      page.getByRole("button", { name: "スキップして後で設定する" }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 受注者視点での発注者名表示
// ---------------------------------------------------------------------------
test.describe("受注者視点での発注者名表示（client_profiles.display_name）", () => {
  test("受注者が発注者一覧（CON-005）で display_name を表示", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/clients");
    // seed の「鈴木工務店株式会社」が表示される
    await expect(page.getByText("鈴木工務店株式会社").first()).toBeVisible();
  });

  test("受注者が発注者詳細（CON-006）で住所を含む display_name を表示", async ({
    page,
  }) => {
    // seed: client@test.local (22222222-...) が display_name=鈴木工務店株式会社、
    // address=東京都墨田区向島1-2-3
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/clients/22222222-2222-2222-2222-222222222222");
    // ヘッダー（h2）要素で社名を確認
    await expect(
      page.getByRole("heading", { name: "鈴木工務店株式会社" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("東京都墨田区向島1-2-3")).toBeVisible();
  });
});
