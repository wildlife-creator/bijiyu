import { test, expect } from "@playwright/test";

import {
  login,
  TEST_ADMIN,
  TEST_CLIENT,
  TEST_CONTRACTOR,
  TEST_CONTRACTOR2,
  TEST_STAFF,
} from "./helpers";

/**
 * 管理運営アカウント（P5 / spec-changes-202608 §2.4）の E2E。
 *
 * seed（supabase/seed.sql「管理運営アカウント」）:
 * - ops-account@test.local (0b50…0001): is_hidden=true、ハイエンドの銀行振込行（期限 2099）、
 *   組織 + 表示名「ビジ友運営（テスト）」
 * - ops-candidate@test.local (0b50…0002): 無料の受注者。ADM-009 の設定 / 解除専用
 *
 * ユーザーストーリー:
 *  A. 一般会員からは運営アカウントが見えない（一覧・直リンク・新規スレッド）
 *  B. 運営 → 発注者（法人）へメッセージ → 発注者本人と担当者が読めて返信できる（messages RLS の identity 対応）
 *  C. 運営 → 職人へメッセージ → 職人が読める
 *  D. 管理画面（ADM-009）で設定 / 解除できる
 */

const OPS = { email: "ops-account@test.local", password: "testpass123" };
const OPS_ID = "0b500000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "0b500000-0000-4000-8000-000000000002";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";
const CONTRACTOR_ID = "11111111-1111-1111-1111-111111111111";
const OPS_DISPLAY_NAME = "ビジ友運営（テスト）";

/**
 * スレッド画面でメッセージを送る。
 * /messages/new からのリダイレクト直後はハイドレーション前で送信ボタンが効かない
 * （テキストは残るのに送信されない）ため、入力後に送信ボタンが有効になるのを待ち、
 * ハイドレーションで入力が消えた場合は入れ直してから押す。
 */
async function sendMessage(page: import("@playwright/test").Page, text: string) {
  const input = page.locator("textarea[placeholder='メッセージ']");
  const button = page.locator("button.rounded-full.bg-primary").last();
  await expect(input).toBeVisible();
  await input.fill(text);
  try {
    await expect(button).toBeEnabled({ timeout: 3000 });
  } catch {
    await input.fill(text);
    await expect(button).toBeEnabled();
  }
  // 送信は楽観的 UI で即時に吹き出しが出るため、Server Action の応答を待ってから
  // 次へ進む（テスト終了でブラウザが閉じると送信リクエストが打ち切られ、DB に残らない）。
  // 同じ送信者が直前の E2E（messaging.spec 等）で送っていると 1 分 3 通の送信制限に
  // 当たるため、その場合は制限の窓（60 秒）を待って 1 回だけやり直す
  for (let attempt = 0; attempt < 2; attempt++) {
    const responsePromise = page.waitForResponse(
      (r) => r.request().method() === "POST" && /\/messages\/[0-9a-f-]+$/.test(r.url()),
    );
    await button.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.text();
    if (body.includes('"success":true')) break;
    // 応答本文の日本語は Playwright 側で文字化けして読めないため、失敗理由は問わず
    // 1 回目の失敗は送信制限とみなして窓を待ってやり直す（2 回目も失敗なら本当の失敗）
    if (attempt === 0 && body.includes('"success":false')) {
      test.setTimeout(150_000); // 60 秒待ちが既定の 30 秒を超えるため延長
      await page.waitForTimeout(61_000);
      await page.reload();
      await expect(input).toBeVisible();
      await input.fill(text);
      await expect(button).toBeEnabled();
      continue;
    }
    expect(body).toContain('"success":true');
  }
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10000 });
}

test.describe("A. 一般会員からは運営アカウントが見えない", () => {
  test("発注者一覧・職人一覧に運営アカウントが出ない", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    // CON-005: seed 直後は新着順で 1 ページ目に出るはずの位置だが、非表示のため出ない
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "発注者一覧" })).toBeVisible();
    await expect(page.getByText(OPS_DISPLAY_NAME)).toHaveCount(0);
    // CLI-005（姓名「ビジ友運営」で表示されるはず）
    await page.goto("/users/contractors");
    await expect(page.getByText(/ビジ友運営/)).toHaveCount(0);
  });

  test("直リンク（発注者詳細・職人詳細・評価詳細・求人お問い合わせ）は 404", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    for (const path of [
      `/clients/${OPS_ID}`,
      `/users/contractors/${OPS_ID}`,
      `/users/${OPS_ID}/reviews`,
      `/clients/${OPS_ID}/inquiry`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    }
  });

  test("運営アカウント宛の新規スレッドは作れない（スレッドが無い相手からは 404）", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR2.email, TEST_CONTRACTOR2.password);
    await page.goto(`/messages/new?to=${OPS_ID}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("自分自身宛の新規スレッドは作れない（発注者詳細も自分は 404）", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/clients/${CLIENT_ID}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await page.goto(`/messages/new?to=${CLIENT_ID}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });
});

test.describe("B. 運営 → 発注者（法人）へメッセージ", () => {
  // 送信は 1 回目のテストで行い、後続テストは固定の書き出しで照合する
  // （テストごとにファイルが再評価されると Date.now() が変わるため、共有はしない）
  const text = "運営から発注者へ提案（P5 E2E）";
  const textPattern = /運営から発注者へ提案（P5 E2E）/;

  test("運営が発注者詳細の「メッセージを送る」からスレッドを作って送信できる", async ({
    page,
  }) => {
    await login(page, OPS.email, OPS.password);
    await page.goto(`/clients/${CLIENT_ID}`);
    await page.getByRole("link", { name: "メッセージを送る" }).first().click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
    await sendMessage(page, text);
  });

  test("発注者本人がスレッドを見て返信できる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/messages");
    await page.getByRole("link", { name: new RegExp(OPS_DISPLAY_NAME) }).first().click();
    await expect(page.getByText(textPattern).first()).toBeVisible({ timeout: 10000 });
    await sendMessage(page, `発注者からの返信 ${Date.now()}`);
  });

  test("発注者の担当者（組織メンバー）も本文を読めて返信できる", async ({ page }) => {
    // 組織⇔組織スレッドで、旧 organization_id に入らない側の担当者。
    // messages RLS の identity 対応（20260902130000）が無いと本文が読めない
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/messages");
    await page.getByRole("link", { name: new RegExp(OPS_DISPLAY_NAME) }).first().click();
    await expect(page.getByText(textPattern).first()).toBeVisible({ timeout: 10000 });
    await sendMessage(page, `担当者からの返信 ${Date.now()}`);
  });

  test("運営側では自分の発言と相手側（本人・担当者）の発言が左右に分かれる", async ({
    page,
  }) => {
    await login(page, OPS.email, OPS.password);
    await page.goto("/messages");
    await page.getByRole("link", { name: /鈴木工務店/ }).first().click();
    await expect(page.getByText(textPattern).first()).toBeVisible({ timeout: 10000 });
    // 自分側の吹き出しは justify-end、相手側は justify-start（担当者の発言も相手側）
    const mine = page.locator("div.justify-end", { hasText: textPattern });
    await expect(mine.first()).toBeVisible();
    const theirs = page.locator("div.justify-start", { hasText: /担当者からの返信/ });
    await expect(theirs.first()).toBeVisible();
  });
});

test.describe("C. 運営 → 職人へメッセージ", () => {
  const text = "運営から職人へ案件のご紹介（P5 E2E）";
  const textPattern = /運営から職人へ案件のご紹介（P5 E2E）/;

  test("運営が職人詳細の「メッセージを送る」から送信できる", async ({ page }) => {
    await login(page, OPS.email, OPS.password);
    await page.goto(`/users/contractors/${CONTRACTOR_ID}`);
    await page.getByRole("link", { name: "メッセージを送る" }).first().click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
    await sendMessage(page, text);
  });

  test("職人がスレッドを見て返信できる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/messages");
    await page.getByRole("link", { name: new RegExp(OPS_DISPLAY_NAME) }).first().click();
    await expect(page.getByText(textPattern).first()).toBeVisible({ timeout: 10000 });
    await sendMessage(page, `職人からの返信 ${Date.now()}`);
  });
});

test.describe("D. 管理画面（ADM-009）で設定 / 解除", () => {
  test("設定 → バッジと契約が付き、解除 → 通常の会員に戻る", async ({ page }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await page.goto(`/admin/users/${CANDIDATE_ID}`);
    await expect(
      page.getByRole("heading", { name: "管理運営アカウント" }),
    ).toBeVisible();
    await expect(page.getByText("現在の状態: 通常の会員")).toBeVisible();

    await page.getByRole("button", { name: "管理運営アカウントに設定する" }).click();
    await page.getByRole("button", { name: "設定する" }).click();
    await expect(page.getByText("管理運営アカウントに設定しました")).toBeVisible();
    await expect(page.getByText("契約: ハイエンドプラン（銀行振込）")).toBeVisible();
    await expect(page.getByText("管理運営", { exact: true })).toBeVisible();
    // 受注者 → 発注者に昇格したので発注者詳細への導線が出る
    await expect(page.getByRole("link", { name: "発注者詳細" })).toBeVisible();

    // 一覧にもバッジ
    await page.goto("/admin/users?q=ops-candidate");
    await expect(page.getByText("管理運営", { exact: true })).toBeVisible();

    // 解除
    await page.goto(`/admin/users/${CANDIDATE_ID}`);
    await page.getByRole("button", { name: "管理運営アカウントを解除する" }).click();
    await page.getByRole("button", { name: "解除する" }).click();
    await expect(page.getByText("管理運営アカウントを解除しました")).toBeVisible();
    await expect(page.getByText("現在の状態: 通常の会員")).toBeVisible();
    // 契約は残る
    await expect(page.getByText("契約: ハイエンドプラン（銀行振込）")).toBeVisible();
  });

  test("運営アカウントの発注者詳細（ADM-004）にバッジが出る", async ({ page }) => {
    await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
    await page.goto(`/admin/clients/${OPS_ID}`);
    await expect(page.getByText(OPS_DISPLAY_NAME)).toBeVisible();
    await expect(page.getByText("管理運営", { exact: true })).toBeVisible();
  });
});
