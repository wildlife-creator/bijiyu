import { test, expect } from "@playwright/test";

import {
  login,
  TEST_ADMIN,
  TEST_CLIENT,
  TEST_CONTRACTOR,
  TEST_CONTRACTOR2,
} from "./helpers";

/**
 * 動画表示 + 管理（video-display spec → P4 動画基盤）の E2E。
 *
 * seed（supabase/seed.sql「動画テストデータ」）:
 * - contractor@test.local (11111): PR動画 1 本（TikTok）+ active 'video'
 * - contractor2@test.local (cc111111): PR動画 2 本（TikTok + Cloudflare ready）、オプション未購入
 *   → P4 で購入ゲート撤廃のため表示される
 * - client@test.local (22222): 職場紹介動画 1 本 + active 'video_workplace'
 * - 山田 (aabbccdd): 職場紹介動画 ready 1 本 + processing 1 本、オプション未購入
 *   → ready のみ表示される
 * - corp-comp (b111...0005): 管理画面の削除 E2E 専用（client_page 1 本）
 *
 * Cloudflare との実通信（ファイルアップロード・Webhook）は E2E の対象外。
 * 管理画面は URL 登録経路で通す。
 */

const CONTRACTOR_ID = "11111111-1111-1111-1111-111111111111";
const CONTRACTOR2_ID = "cc111111-1111-1111-1111-111111111111";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";
const CLIENT_NO_OPTION_ID = "aabbccdd-1111-2222-3333-444455556666";
const CLIENT_DELETE_TARGET_ID = "b1110000-0000-1000-8000-000000000005";

const TIKTOK_PLAYER_IFRAME = 'iframe[src*="tiktok.com/player/v1"]';
const CLOUDFLARE_PLAYER_IFRAME = 'iframe[src*="iframe.videodelivery.net/"]';

test.describe("CLI-026: 職場紹介動画掲載オプション（課金画面は P4 で変更なし）", () => {
  test("発注者プラン active なら申込ボタンが活性", async ({ page }) => {
    // client@test.local は seed で active な 'video_workplace' オプションを持つ。
    // 購入済みユーザーのボタンラベルは「購入済み」になる（活性のまま・押下で再購入確認）。
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/billing");
    await expect(
      page.getByText("職場紹介動画掲載", { exact: true }),
    ).toBeVisible();
    const btn = page.getByRole("button", { name: "購入済み", exact: true });
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
    await expect(page.locator(TIKTOK_PLAYER_IFRAME)).toBeVisible();
  });

  test("オプション未購入でも登録済みの複数本が表示順どおりに表示される", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR2.email, TEST_CONTRACTOR2.password);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "PR動画" })).toBeVisible();
    const buttons = page.getByRole("button", { name: /^PR動画 \d+を再生$/ });
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toHaveAccessibleName("PR動画 1を再生");
    await expect(buttons.nth(1)).toHaveAccessibleName("PR動画 2を再生");
  });
});

test.describe("CLI-006: 受注者詳細のPR動画（cross-user）", () => {
  test("発注者視点で対象受注者のPR動画が表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/users/contractors/${CONTRACTOR_ID}`);
    await expect(page.getByRole("heading", { name: "PR動画" })).toBeVisible();
    await page.getByRole("button", { name: "PR動画を再生" }).click();
    await expect(page.locator(TIKTOK_PLAYER_IFRAME)).toBeVisible();
  });

  test("オプション未購入の受注者でも動画が表示され、Cloudflare 動画も再生できる", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/users/contractors/${CONTRACTOR2_ID}`);
    await expect(page.getByRole("heading", { name: "PR動画" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^PR動画 \d+を再生$/ }),
    ).toHaveCount(2);
    // 2 本目（Cloudflare）は 16:9 の Cloudflare プレイヤー iframe
    await page.getByRole("button", { name: "PR動画 2を再生" }).click();
    await expect(page.locator(CLOUDFLARE_PLAYER_IFRAME)).toBeVisible();
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
    await expect(page.locator(TIKTOK_PLAYER_IFRAME)).toBeVisible();
  });

  test("オプション未購入の発注者でも公開中の動画は表示され、処理中は出ない", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/clients/${CLIENT_NO_OPTION_ID}`);
    await expect(
      page.getByRole("heading", { name: "職場紹介動画" }),
    ).toBeVisible();
    // ready 1 本 + processing 1 本 → 表示は 1 本だけ（番号なしのラベル）
    await expect(
      page.getByRole("button", { name: "職場紹介動画を再生" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /^職場紹介動画 \d+を再生$/ }),
    ).toHaveCount(0);
  });
});

test.describe("CLI-020: 自社の職場紹介動画", () => {
  test("発注者情報画面で自社の職場紹介動画が表示される", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "職場紹介動画" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "職場紹介動画を再生" }),
    ).toBeVisible();
  });
});

test.describe("管理者: 動画管理（ADM ログイン → 一覧 → 詳細 → ADM-027）", () => {
  test("admin ログインで /admin/dashboard に到達する", async ({ page }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("ダッシュボード → ユーザー一覧 → 詳細 → ADM-027 で URL 追加・並び替え・削除ができる", async ({
    page,
  }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    // dashboard → user list
    await page.getByRole("link", { name: "ユーザーアカウント一覧" }).click();
    await expect(page).toHaveURL(/\/admin\/users/);

    // 対象ユーザーを email で絞り込み
    await page.getByLabel("キーワード").fill("contractor@test.local");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(
      page.getByText("contractor@test.local", { exact: true }),
    ).toBeVisible();

    // 詳細へ（部分一致で adm-del-contractor@test.local 等を巻き込まないよう negative lookbehind）
    await page
      .getByRole("link", { name: /(?<!-)contractor@test\.local/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/users\//);

    // P4: 購入ゲート撤廃により導線は常時表示
    await page
      .getByRole("link", { name: "受注者PR動画を投稿/編集する" })
      .click();
    await expect(page).toHaveURL(/\/videos\?placement=contractor_page/);
    await expect(
      page.getByRole("heading", { name: "ユーザー動画管理" }),
    ).toBeVisible();
    await expect(page.getByText("登録済みの動画（1本）")).toBeVisible();

    // URL で追加
    const tab = page.getByRole("tabpanel");
    await tab.getByLabel("URL").fill(
      "https://www.tiktok.com/@bijiyu/video/7999999999999999999",
    );
    await tab
      .getByLabel("管理用ラベル（任意）")
      .last()
      .fill("E2E 追加");
    await tab.getByRole("button", { name: "URL で追加" }).click();
    await expect(page.getByText("動画を追加しました")).toBeVisible();
    await expect(page.getByText("登録済みの動画（2本）")).toBeVisible();
    const added = page.getByRole("listitem", { name: "E2E 追加" });
    await expect(added).toContainText("2. E2E 追加");

    // 上へ → 1 番目になる
    await page.getByRole("button", { name: "E2E 追加を上へ" }).click();
    await expect(added).toContainText("1. E2E 追加");

    // 削除（確認ダイアログ）
    await page.getByRole("button", { name: "E2E 追加を削除" }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("動画を削除しました")).toBeVisible();
    await expect(page.getByText("登録済みの動画（1本）")).toBeVisible();

    // もどる → ADM-009
    await page.getByRole("button", { name: "もどる" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${CONTRACTOR_ID}$`));
  });

  test("ADM-004 → 職場紹介動画タブで削除でき、CON-006 から消える", async ({
    page,
  }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    // CON-006 表示用 client@test を壊さないよう、削除専用ユーザーで検証
    await page.goto(`/admin/clients/${CLIENT_DELETE_TARGET_ID}`);
    await expect(
      page.getByRole("heading", { name: "職場紹介動画" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "職場紹介動画を投稿/編集する" })
      .click();
    await expect(page).toHaveURL(/\/videos\?placement=client_page/);
    await expect(
      page.getByRole("tab", { name: "職場紹介動画" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("登録済みの動画（1本）")).toBeVisible();

    await page.getByRole("button", { name: "削除テスト用を削除" }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("動画を削除しました")).toBeVisible();
    await expect(page.getByText("登録済みの動画（0本）")).toBeVisible();

    // もどる → ADM-004 で動画セクションが消えている
    await page.getByRole("button", { name: "もどる" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/clients/${CLIENT_DELETE_TARGET_ID}$`),
    );
    await expect(
      page.getByRole("heading", { name: "職場紹介動画" }),
    ).toHaveCount(0);
  });

  test("ADM-009 には職場紹介動画ボタンを表示しない（入口は ADM-004 のみ）", async ({
    page,
  }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await page.goto(`/admin/users/${CLIENT_DELETE_TARGET_ID}`);
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

  test("ADM-027 で Cloudflare 未設定時はファイルアップロードが無効で案内が出る", async ({
    page,
  }) => {
    // ローカル E2E 環境は CLOUDFLARE_* 未設定（URL 登録のみ動く graceful degradation）
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await page.goto(
      `/admin/users/${CONTRACTOR2_ID}/videos?placement=contractor_page`,
    );
    const tab = page.getByRole("tabpanel");
    await expect(
      tab.getByText(/Cloudflare Stream が設定されていない/),
    ).toBeVisible();
    await expect(
      tab.getByRole("button", { name: "アップロードして追加" }),
    ).toBeDisabled();
    // Cloudflare 動画の行はアップロード種別として表示される
    await expect(tab.getByText("アップロード（Cloudflare）")).toBeVisible();
  });
});
