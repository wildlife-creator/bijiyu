import { test, expect } from "@playwright/test";

import {
  login,
  TEST_ADMIN,
  TEST_CLIENT,
  TEST_CONTRACTOR,
} from "./helpers";

/**
 * video-display spec E2E（Task 7.2）。
 *
 * seed (Task 7.1):
 * - contractor@test.local (11111): video_url あり + active 'video' あり → PR動画表示
 * - contractor2@test.local (cc111111): video_url あり + active なし → 非表示
 * - client@test.local (22222): workplace_video_url あり + active 'video_workplace' あり → CON-006 表示
 * - 山田 (aabbccdd): workplace_video_url あり + active なし → CON-006 非表示
 */

const CONTRACTOR_ID = "11111111-1111-1111-1111-111111111111";
const CONTRACTOR2_ID = "cc111111-1111-1111-1111-111111111111";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";
const CLIENT_NO_ACTIVE_ID = "aabbccdd-1111-2222-3333-444455556666";
// 掲載停止（空更新）E2E 専用ユーザー。CON-006 表示用 client@test を破壊しないよう分離。
const CLIENT_VW_STOP_ID = "b1110000-0000-1000-8000-000000000005";

const PLAYER_IFRAME = 'iframe[src*="tiktok.com/player/v1"]';

test.describe("CLI-026: 職場紹介動画掲載オプション", () => {
  test("発注者プラン active なら申込ボタンが活性", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(
      page.getByText("職場紹介動画掲載", { exact: true }),
    ).toBeVisible();
    const btn = page.getByRole("button", {
      name: "職場紹介動画掲載を申し込む",
    });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("無料受注者では申込ボタンが非活性", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/billing");
    const btn = page.getByRole("button", {
      name: "職場紹介動画掲載を申し込む",
    });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });
});

test.describe("COM-001: 自分のPR動画", () => {
  test("PR動画が表示され、再生ボタンで TikTok player iframe が出現する", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "PR動画" })).toBeVisible();
    await page.getByRole("button", { name: "PR動画を再生" }).click();
    await expect(page.locator(PLAYER_IFRAME)).toBeVisible();
  });
});

test.describe("CLI-006: 受注者詳細のPR動画（cross-user / admin client 経路）", () => {
  test("発注者視点で対象受注者のPR動画が表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/users/contractors/${CONTRACTOR_ID}`);
    await expect(page.getByRole("heading", { name: "PR動画" })).toBeVisible();
    await page.getByRole("button", { name: "PR動画を再生" }).click();
    await expect(page.locator(PLAYER_IFRAME)).toBeVisible();
  });

  test("video_url ありでも active option なしの受注者では非表示", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/users/contractors/${CONTRACTOR2_ID}`);
    await expect(
      page.getByRole("heading", { name: "PR動画" }),
    ).toHaveCount(0);
  });
});

test.describe("CON-006: 発注者詳細の職場紹介動画", () => {
  test("active video_workplace の発注者で職場紹介動画が表示される", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/clients/${CLIENT_ID}`);
    await expect(
      page.getByRole("heading", { name: "職場紹介動画" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "職場紹介動画を再生" }).click();
    await expect(page.locator(PLAYER_IFRAME)).toBeVisible();
  });

  test("workplace_video_url ありでも active なしの発注者では非表示", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/clients/${CLIENT_NO_ACTIVE_ID}`);
    await expect(
      page.getByRole("heading", { name: "職場紹介動画" }),
    ).toHaveCount(0);
  });
});

test.describe("管理者: 動画投稿導線（ADM ログイン → 一覧 → 詳細 → 投稿）", () => {
  test("admin ログインで /admin/dashboard に到達する", async ({ page }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("ダッシュボード → ユーザー一覧 → 詳細 → ADM-010 で URL 登録できる", async ({
    page,
  }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    // dashboard → user list
    await page.getByRole("link", { name: "ユーザーアカウント一覧" }).click();
    await expect(page).toHaveURL(/\/admin\/users/);

    // 対象ユーザーを email で絞り込み
    await page.getByLabel("キーワード").fill("contractor@test.local");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page.getByText("contractor@test.local")).toBeVisible();

    // 詳細へ（氏名はプロフィール編集系 spec で変わりうるため email で行を特定）
    // リンクの accessible name は「氏名（N歳） email ›」のような複合テキストなので
    // 部分一致だと adm-del-contractor@test.local 等を巻き込む。直前に `-` が無い
    // ことを negative lookbehind で要求し、純粋な contractor@test.local 行に限定。
    await page
      .getByRole("link", { name: /(?<!-)contractor@test\.local/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/users\//);

    // active 'video' があるので「受注者PR動画を投稿/編集する」ボタンが出る
    await page
      .getByRole("link", { name: "受注者PR動画を投稿/編集する" })
      .click();
    await expect(page).toHaveURL(/\/video$/);

    // URL を更新
    await page
      .getByLabel("URL")
      .fill("https://www.tiktok.com/@bijiyu/video/7999999999999999999");
    await page.getByRole("button", { name: "更新" }).click();
    await expect(page.getByText("動画 URL を更新しました")).toBeVisible();
  });

  test("ADM-004 で職場紹介動画オプション加入者には職場紹介投稿ボタンが出る", async ({
    page,
  }) => {
    // 投稿入口は admin spec で ADM-009 → ADM-004（発注者詳細）へ移設済み
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    // CON-006 表示用 client@test を壊さないよう、掲載停止専用ユーザーで検証
    await page.goto(`/admin/clients/${CLIENT_VW_STOP_ID}`);
    await expect(
      page.getByRole("link", { name: "職場紹介動画を投稿/編集する" }),
    ).toBeVisible();
    // ADM-010B へ遷移して空更新（掲載停止）
    await page
      .getByRole("link", { name: "職場紹介動画を投稿/編集する" })
      .click();
    await expect(page).toHaveURL(/\/workplace-video$/);
    await expect(page.getByText("現在の登録URL")).toBeVisible();
    await page.getByRole("button", { name: "更新" }).click();
    await expect(page.getByText("動画の掲載を停止しました")).toBeVisible();
  });

  test("ADM-009 には職場紹介動画ボタンを表示しない（入口は ADM-004 のみ）", async ({
    page,
  }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await page.goto(`/admin/users/${CLIENT_VW_STOP_ID}`);
    await expect(
      page.getByRole("heading", { name: "ユーザーアカウント詳細" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /職場紹介動画を投稿/ }),
    ).toHaveCount(0);
    // client ロールには削除ボタンの代わりに発注者詳細への導線が出る
    await expect(
      page.getByRole("link", { name: "発注者詳細" }),
    ).toBeVisible();
  });
});
