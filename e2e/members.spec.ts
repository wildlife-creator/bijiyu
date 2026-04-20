import { expect, test } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_CONTRACTOR,
  TEST_INDIVIDUAL_CLIENT,
  TEST_STAFF,
  TEST_STAFF_ADMIN,
} from "./helpers";

/**
 * organization spec Task 17.3 + 17.3.5: 担当者管理 E2E
 *
 * CLI-022〜025 の表示・権限・リダイレクト挙動を検証する。
 *
 * 招待メール実送信 + Inbucket / AUTH-008 パスワード設定の通しフローは
 * seed データでの先行セットアップが難しいため、別途 Vitest 統合テスト
 * （Task 11.1 / Task 12）でカバー済み。本 E2E ではブラウザ UI での
 * CRUD と権限外アクセスに集中する。
 */

// ---------------------------------------------------------------------------
// CLI-022 担当者一覧
// ---------------------------------------------------------------------------
test.describe("CLI-022 担当者一覧", () => {
  test("Owner で seed 投入済みの招待中 / 完了メンバーが表示される", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/members");
    await expect(
      page.getByRole("heading", { name: "担当者一覧" }),
    ).toBeVisible();

    // 招待中バッジ（invited-admin@test.local: password_set_at IS NULL）
    await expect(page.getByText("招待中").first()).toBeVisible();

    // 管理責任者タグ（Owner 自身）
    await expect(page.getByText("管理責任者").first()).toBeVisible();

    // 「担当者新規登録」ボタンが Owner には表示される
    await expect(
      page.getByRole("link", { name: "担当者新規登録" }),
    ).toBeVisible();
  });

  test("Staff では「担当者新規登録」ボタン非表示", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage/members");
    await expect(
      page.getByRole("heading", { name: "担当者一覧" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "担当者新規登録" }),
    ).toHaveCount(0);
  });

  test("キーワード検索でメンバーが絞り込まれる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/members?q=招待");
    await expect(
      page.getByRole("heading", { name: "担当者一覧" }),
    ).toBeVisible();
    // 「招待」を含む氏名のメンバーが見える
    await expect(page.getByText(/招待/).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CLI-023 担当者詳細
// ---------------------------------------------------------------------------
test.describe("CLI-023 担当者詳細", () => {
  test("Owner が Staff 詳細を開くと「編集する」と「削除する」両方表示", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    // seed: staff@test.local = 33333333-3333-3333-3333-333333333333
    await page.goto("/mypage/members/33333333-3333-3333-3333-333333333333");
    await expect(
      page.getByRole("heading", { name: "担当者詳細" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "編集する" })).toBeVisible();
    await expect(page.getByRole("button", { name: "削除する" })).toBeVisible();
  });

  test("Staff が自分の詳細を開くと「プロフィールを編集」のみ（削除非表示）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage/members/33333333-3333-3333-3333-333333333333");
    await expect(
      page.getByRole("heading", { name: "担当者詳細" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "プロフィールを編集" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "削除する" })).toHaveCount(0);
  });

  test("Staff が他メンバー詳細を開くと編集・削除ボタンとも非表示", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    // Owner 詳細を開く
    await page.goto("/mypage/members/22222222-2222-2222-2222-222222222222");
    await expect(
      page.getByRole("heading", { name: "担当者詳細" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "編集する" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "プロフィールを編集" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "削除する" })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// CLI-024 編集 - Owner が /profile/edit 自己編集にリダイレクト
// ---------------------------------------------------------------------------
test.describe("CLI-024 自己編集リダイレクト", () => {
  test("Owner が自分の /mypage/members/[自分ID]/edit を開くと /profile/edit にリダイレクト", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/members/22222222-2222-2222-2222-222222222222/edit");
    await page.waitForURL(/\/profile\/edit/, { timeout: 10000 });
  });

  test("Staff が URL 直打ちで /profile/edit → CLI-024 自己編集に転送", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/profile/edit");
    await page.waitForURL(
      /\/mypage\/members\/33333333-3333-3333-3333-333333333333\/edit/,
      { timeout: 10000 },
    );
    await expect(
      page.getByRole("heading", { name: "担当者編集" }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CLI-025 新規作成 - 権限ガード
// ---------------------------------------------------------------------------
test.describe("CLI-025 新規作成 権限ガード", () => {
  test("Staff は /mypage/members/new を開けず一覧へリダイレクト", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage/members/new");
    await page.waitForURL(/\/mypage\/members(?!\/new)/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "担当者一覧" }),
    ).toBeVisible();
  });

  test("個人プラン client は /mypage/members/new を開けずリダイレクト", async ({
    page,
  }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/mypage/members/new");
    // 個人プランは organization_members なしで /mypage に redirect
    await page.waitForURL(/\/mypage(?:\?|$)/, { timeout: 10000 });
  });

  test("Owner は /mypage/members/new を開ける", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/members/new");
    await expect(
      page.getByRole("heading", { name: "担当者新規作成" }),
    ).toBeVisible();
  });

  test("Admin が CLI-025 で管理者選択肢が disabled / 非表示", async ({ page }) => {
    await login(page, TEST_STAFF_ADMIN.email, TEST_STAFF_ADMIN.password);
    await page.goto("/mypage/members/new");
    await expect(
      page.getByRole("heading", { name: "担当者新規作成" }),
    ).toBeVisible();

    // 権限欄の select に「管理者」option が無い（Admin のみ）
    const roleSelect = page.locator("select#orgRole");
    const options = await roleSelect.locator("option").allInnerTexts();
    expect(options).not.toContain("管理者");
    expect(options).toContain("担当者");
  });
});

// ---------------------------------------------------------------------------
// /profile/edit バナー（Task 13.5）
// ---------------------------------------------------------------------------
test.describe("/profile/edit 法人プラン Owner バナー（Task 13.5）", () => {
  test("法人プラン Owner: /profile/edit に注意バナー表示", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/profile/edit");
    await expect(page.getByText(/管理責任者）を別の方に引き継ぐ場合/)).toBeVisible();
  });

  test("個人プラン: /profile/edit にバナー表示されない", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/profile/edit");
    await expect(page.getByText(/管理責任者）を別の方に引き継ぐ場合/)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// AUTH-008 招待承諾画面（Task 12）
//   - Server Action の挙動（期限切れ・パスワード強度）は Vitest 単体テスト
//     （src/__tests__/organization/accept-invite-action.test.ts）でカバー済み
//   - Client Component の password_set_at 判定リダイレクトは seed 側の
//     password_set_at セットが本 E2E の範囲で難しいため割愛
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 権限外アクセス（受注者は /mypage/members 自体に到達できない）
// ---------------------------------------------------------------------------
test.describe("権限外アクセスブロック（Middleware）", () => {
  test("contractor は /mypage/members を開けず /mypage へリダイレクト", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/mypage/members");
    await page.waitForURL(/\/mypage(?!\/)/, { timeout: 10000 });
  });
});
