import { expect, test } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_CONTRACTOR,
  TEST_INDIVIDUAL_CLIENT,
  TEST_STAFF,
} from "./helpers";

/**
 * マイページ（CON-001）からの導線スモーク。
 *
 * 背景: 2026-04 に /mypage のメニューが存在しない URL を指していた（/scouts/templates
 * 等）バグが発生。既存 E2E はすべて対象画面に page.goto で直接遷移していたため、
 * マイページから辿れるかは検証されていなかった。本ファイルはロール別に「マイページ
 * → 主要リンクをクリック → 到達確認」までをカバーし、再発を防ぐ。
 */

test.describe("/mypage ナビゲーション（法人プラン Owner）", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage");
  });

  test("スカウトメッセージテンプレート一覧 → /messages/templates", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: "スカウトメッセージテンプレート一覧" })
      .click();
    await expect(page).toHaveURL(/\/messages\/templates$/);
  });

  test("発注者情報詳細 → /mypage/client-profile", async ({ page }) => {
    await page.getByRole("link", { name: "発注者情報詳細" }).click();
    await expect(page).toHaveURL(/\/mypage\/client-profile$/);
  });

  test("担当者一覧 → /mypage/members", async ({ page }) => {
    await page.getByRole("link", { name: "担当者一覧" }).click();
    await expect(page).toHaveURL(/\/mypage\/members$/);
  });

  test("CLI-020 の もどる ボタンで /mypage に戻れる（save 後の history 汚染対策）", async ({
    page,
  }) => {
    // /mypage → /client-profile → /client-profile/edit → （保存想定せず）/client-profile
    // の状況を再現し、/client-profile で もどる → /mypage を検証
    await page.getByRole("link", { name: "発注者情報詳細" }).click();
    await expect(page).toHaveURL(/\/mypage\/client-profile$/);
    await page.getByRole("link", { name: "編集する" }).click();
    await expect(page).toHaveURL(/\/mypage\/client-profile\/edit$/);
    await page.goBack(); // browser back to /client-profile（save 後の流れを模擬）
    await expect(page).toHaveURL(/\/mypage\/client-profile$/);
    // CLI-020 の「もどる」は href="/mypage" で明示遷移
    await page.getByRole("button", { name: "もどる" }).click();
    await expect(page).toHaveURL(/\/mypage$/);
  });
});

test.describe("/mypage ナビゲーション（法人プラン Staff）", () => {
  // seed の staff@test.local の userId
  const STAFF_USER_ID = "33333333-3333-3333-3333-333333333333";

  test("Staff でもクライアント 3 メニューと担当者一覧が表示される", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");

    await expect(
      page.getByRole("link", { name: "スカウトメッセージテンプレート一覧" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "発注者情報詳細" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "担当者一覧" }),
    ).toBeVisible();
  });

  test("Staff: スカウトテンプレ一覧へ遷移できる", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");
    await page
      .getByRole("link", { name: "スカウトメッセージテンプレート一覧" })
      .click();
    await expect(page).toHaveURL(/\/messages\/templates$/);
  });

  test("Staff: 本人確認・CCUS登録 メニューは非表示（REQ-ORG-011）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");
    await expect(
      page.getByRole("link", { name: "本人確認・CCUS登録" }),
    ).toHaveCount(0);
  });

  test("Staff: ユーザープロフィール変更クリック → CLI-024 自己編集へ直遷移（REQ-ORG-011）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");
    await page
      .getByRole("link", { name: "ユーザープロフィール変更" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/mypage/members/${STAFF_USER_ID}/edit$`),
    );
  });

  test("Staff: /profile 直 URL アクセスで CLI-024 にリダイレクト（REQ-ORG-011）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/profile");
    await expect(page).toHaveURL(
      new RegExp(`/mypage/members/${STAFF_USER_ID}/edit$`),
    );
  });

  test("Staff: マイページ上部に本人確認/CCUS バッジが表示されない（REQ-ORG-011）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");
    // 本人確認バッジ（「未承認」「済み」「申請中」のいずれも出ない）
    await expect(page.getByText("本人確認未承認")).toHaveCount(0);
    await expect(page.getByText("本人確認済み")).toHaveCount(0);
    await expect(page.getByText("本人確認申請中")).toHaveCount(0);
    // CCUS バッジ（同様）
    await expect(page.getByText("CCUS未登録")).toHaveCount(0);
    await expect(page.getByText("CCUS登録済み")).toHaveCount(0);
    await expect(page.getByText("CCUS申請中")).toHaveCount(0);
  });

  test("Staff: マイページ上部の「プロフィールを変更する」ボタンも CLI-024 直リンク（REQ-ORG-011）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");
    // 「プロフィールを変更する」は上部の大型 CTA ボタン + 下部メニューの両方にあり得る。
    // 上部ボタンは Button asChild で Link を包んでいる構造。first() で上側を押下する。
    await page
      .getByRole("link", { name: "プロフィールを変更する" })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/mypage/members/${STAFF_USER_ID}/edit$`),
    );
  });

  test("Staff: 自分の CLI-023 から もどる → /mypage（isSelf 分岐、REQ-ORG-011）", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/mypage/members/${STAFF_USER_ID}`);
    await page.getByRole("button", { name: "もどる" }).click();
    await expect(page).toHaveURL(/\/mypage$/);
  });

  test("Staff: 他メンバーの CLI-023 から もどる → /mypage/members（isSelf 分岐、REQ-ORG-011）", async ({
    page,
  }) => {
    // seed の staff-admin@test.local（Admin）の userId
    const ADMIN_USER_ID = "ee111111-1111-1111-1111-111111111111";
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/mypage/members/${ADMIN_USER_ID}`);
    await page.getByRole("button", { name: "もどる" }).click();
    await expect(page).toHaveURL(/\/mypage\/members$/);
  });
});

test.describe("/mypage ナビゲーション（個人発注者プラン）", () => {
  test("個人発注者: テンプレ・発注者情報は出るが担当者一覧は出ない", async ({
    page,
  }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/mypage");

    await expect(
      page.getByRole("link", { name: "スカウトメッセージテンプレート一覧" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "発注者情報詳細" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "担当者一覧" }),
    ).toHaveCount(0);
  });
});

test.describe("/mypage ナビゲーション（無料受注者）", () => {
  test("受注者: 発注者向け 3 メニューが一切表示されない", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/mypage");

    await expect(
      page.getByRole("link", { name: "スカウトメッセージテンプレート一覧" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "発注者情報詳細" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "担当者一覧" }),
    ).toHaveCount(0);
  });
});
