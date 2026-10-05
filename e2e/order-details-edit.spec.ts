import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { test, expect, type Page } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_CLIENT2,
  TEST_CONTRACTOR,
  TEST_CONTRACTOR2,
  TEST_STAFF,
} from "./helpers";

/**
 * 発注内容の編集（CLI-011 発注履歴詳細 →「発注内容を編集する」→ CLI-011B）
 *
 * 発注確定のときに発注者が入力した 4 項目（勤務地・業務に関する書類・その他・初回稼働日）を、
 * 発注確定の間（どちらも完了報告を出していない間）だけ後から直せる。
 *
 * ユーザーストーリー:
 *   発注者 1. マイページから発注履歴 → 詳細 → 編集 → 保存し、詳細に新しい内容が出る
 *   発注者 2. 書類を追加・削除できる
 *   発注者 3. 何も変えずに保存するとメールは送られない
 *   発注者 4. 必須項目を空にすると保存できない
 *   担当者 5. 同じ組織の担当者も編集できる
 *   受注者 6. 応募詳細に変更後の内容が出て、変更のお知らせメールが届く
 *   対象外 7. 完了報告が出た応募には編集ボタンが出ず、編集画面も開けない
 *   対象外 8. 別の発注者・受注者は編集画面を開けない
 *
 * seed: ed17a…01（Owner 用）/ ed17a…02（担当者用）/ aaaa…aaaa（発注者が評価済み = 編集不可）
 */
const APP_FOR_OWNER = "ed17a000-0000-4000-8000-000000000001";
const APP_FOR_STAFF = "ed17a000-0000-4000-8000-000000000002";
const APP_REVIEWED = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const JOB_TITLE = "発注内容の編集テスト用案件";
const PDF_FIXTURE = join(__dirname, "fixtures", "sample.pdf");
const DEV_MAIL_DIR = "/tmp/bijiyu-dev-mail";

function dateFromToday(days: number): { input: string; display: string } {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return { input: `${yyyy}-${mm}-${dd}`, display: `${yyyy}/${mm}/${dd}` };
}

/** dev 環境のメール（/tmp/bijiyu-dev-mail の .json sidecar）から、since 以降の件名を集める */
async function mailSubjectsSince(to: string, since: Date): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(DEV_MAIL_DIR);
  } catch {
    return [];
  }
  const subjects: string[] = [];
  for (const f of files.filter((n) => n.endsWith(`-${to}.json`))) {
    const meta = JSON.parse(await readFile(join(DEV_MAIL_DIR, f), "utf8")) as {
      subject: string;
      sentAt: string;
    };
    if (new Date(meta.sentAt) >= since) subjects.push(meta.subject);
  }
  return subjects;
}

/** 発注者の詳細（CLI-011）の「発注内容」枠。同じ日付が応募内容にも出るので枠に絞って確認する */
function orderBox(page: Page) {
  return page.getByRole("heading", { name: "発注内容", exact: true }).locator("..");
}

/** 受注者の応募詳細（CON-012）の「勤務についての詳細」枠 */
function workDetailBox(page: Page) {
  return page.getByRole("heading", { name: "勤務についての詳細" }).locator("..");
}

async function saveAndConfirm(page: Page, dialogTitle: string) {
  await page.getByRole("button", { name: "保存する" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(dialogTitle)).toBeVisible({ timeout: 30000 });
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("heading", { name: "発注内容詳細" })).toBeVisible({
    timeout: 15000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("発注者: 発注内容の編集", () => {
  test("マイページ → 発注履歴 → 詳細 → 編集 → 保存で内容が変わり、受注者と発注者にメールが送られる", async ({
    page,
  }) => {
    const startedAt = new Date();
    const newDate = dateFromToday(25);

    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.getByRole("link", { name: "発注履歴一覧" }).click();
    await expect(page.getByRole("heading", { name: "発注履歴一覧" })).toBeVisible();

    await page.locator(`a[href="/applications/orders/${APP_FOR_OWNER}"]`).click();
    await expect(page.getByRole("heading", { name: "発注内容詳細" })).toBeVisible();

    // 発注内容の枠に 4 項目が出ている
    await expect(page.getByRole("heading", { name: "発注内容", exact: true })).toBeVisible();
    await expect(orderBox(page).getByText("東京都新宿区西新宿1-1-1 編集テスト現場")).toBeVisible();
    await expect(orderBox(page).getByText("朝礼は8時開始です。")).toBeVisible();
    await expect(orderBox(page).getByText(dateFromToday(20).display)).toBeVisible();

    await page.getByRole("link", { name: "発注内容を編集する" }).click();
    await expect(page.getByRole("heading", { name: "発注内容の編集", exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(JOB_TITLE)).toBeVisible();

    // 今の内容が入った状態で始まる
    const location = page.getByLabel("勤務地");
    await expect(location).toHaveValue("東京都新宿区西新宿1-1-1 編集テスト現場");
    await expect(page.getByLabel("その他")).toHaveValue("朝礼は8時開始です。");
    await expect(page.getByLabel("初回稼働日")).toHaveValue(dateFromToday(20).input);

    await location.fill("東京都港区芝公園4-2-8 変更後の現場");
    await page.getByLabel("その他").fill("集合場所が変わりました。");
    await page.getByLabel("初回稼働日").fill(newDate.input);

    await saveAndConfirm(page, "保存しました");

    await expect(orderBox(page).getByText("東京都港区芝公園4-2-8 変更後の現場")).toBeVisible();
    await expect(orderBox(page).getByText("集合場所が変わりました。")).toBeVisible();
    await expect(orderBox(page).getByText(newDate.display)).toBeVisible();
    await expect(page.getByText("東京都新宿区西新宿1-1-1 編集テスト現場")).toHaveCount(0);

    // 受注者宛のお知らせと、発注者側の控え
    await expect
      .poll(() => mailSubjectsSince(TEST_CONTRACTOR.email, startedAt), { timeout: 15000 })
      .toContain(`【ビジ友】「${JOB_TITLE}」の発注内容が変更されました`);
    await expect
      .poll(() => mailSubjectsSince(TEST_CLIENT.email, startedAt), { timeout: 15000 })
      .toContain(`【ビジ友】「${JOB_TITLE}」の発注内容を変更しました`);
  });

  test("受注者の応募詳細に変更後の内容が出る", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/applications/history/${APP_FOR_OWNER}`);
    await expect(page.getByRole("heading", { name: "応募詳細" })).toBeVisible();
    await expect(workDetailBox(page).getByText("東京都港区芝公園4-2-8 変更後の現場")).toBeVisible();
    await expect(workDetailBox(page).getByText("集合場所が変わりました。")).toBeVisible();
    await expect(workDetailBox(page).getByText(dateFromToday(25).display)).toBeVisible();
  });

  test("書類を追加して保存すると、発注者と受注者の両方の画面に出る", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/orders/${APP_FOR_OWNER}/edit`);
    await expect(page.getByText("登録されている書類はありません。")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(PDF_FIXTURE);
    await expect(page.getByText("sample.pdf")).toBeVisible();
    await saveAndConfirm(page, "保存しました");
    await expect(page.getByRole("link", { name: "PDFを開く" })).toHaveCount(1);

    await page.context().clearCookies();
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/applications/history/${APP_FOR_OWNER}`);
    await expect(page.getByRole("link", { name: "PDFを開く" })).toHaveCount(1);
  });

  test("何も変えずに保存すると「変更はありません」になり、メールは送られない", async ({
    page,
  }) => {
    const startedAt = new Date();
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/orders/${APP_FOR_OWNER}/edit`);
    await expect(page.getByLabel("勤務地")).toHaveValue("東京都港区芝公園4-2-8 変更後の現場");

    await saveAndConfirm(page, "変更はありません");
    await expect(page.getByRole("link", { name: "PDFを開く" })).toHaveCount(1);

    expect(await mailSubjectsSince(TEST_CONTRACTOR.email, startedAt)).toEqual([]);
    expect(await mailSubjectsSince(TEST_CLIENT.email, startedAt)).toEqual([]);
  });

  test("書類を ✕ で外して保存すると、発注者と受注者の両方の画面から消える", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/orders/${APP_FOR_OWNER}/edit`);
    await page.getByRole("button", { name: "登録済みの書類 1 を削除" }).click();
    await expect(page.getByText("登録されている書類はありません。")).toBeVisible();

    await saveAndConfirm(page, "保存しました");
    await expect(page.getByRole("link", { name: "PDFを開く" })).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/applications/history/${APP_FOR_OWNER}`);
    await expect(page.getByRole("heading", { name: "応募詳細" })).toBeVisible();
    await expect(page.getByRole("link", { name: "PDFを開く" })).toHaveCount(0);
  });

  test("勤務地か初回稼働日を空にすると保存ボタンが押せない", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/orders/${APP_FOR_OWNER}/edit`);
    const location = page.getByLabel("勤務地");
    await expect(location).toHaveValue("東京都港区芝公園4-2-8 変更後の現場");
    const save = page.getByRole("button", { name: "保存する" });
    await expect(save).toBeEnabled();

    await location.clear();
    await expect(save).toBeDisabled();
    await location.fill("東京都港区芝公園4-2-8 変更後の現場");
    await expect(save).toBeEnabled();

    await page.getByLabel("初回稼働日").clear();
    await expect(save).toBeDisabled();
  });
});

test.describe("担当者: 発注内容の編集", () => {
  test("同じ組織の担当者も、詳細から編集して保存できる", async ({ page }) => {
    const startedAt = new Date();
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/applications/orders/${APP_FOR_STAFF}`);
    await page.getByRole("link", { name: "発注内容を編集する" }).click();
    await expect(page.getByRole("heading", { name: "発注内容の編集", exact: true })).toBeVisible({
      timeout: 30000,
    });

    const location = page.getByLabel("勤務地");
    await expect(location).toHaveValue("東京都新宿区西新宿2-2-2 担当者テスト現場");
    await location.fill("東京都新宿区西新宿3-3-3 担当者が変更");

    await saveAndConfirm(page, "保存しました");
    await expect(page.getByText("東京都新宿区西新宿3-3-3 担当者が変更")).toBeVisible();

    // 受注者に届く。勤務地だけの変更なので、発注者側の控えは組織の Owner にも届く
    await expect
      .poll(() => mailSubjectsSince(TEST_CONTRACTOR2.email, startedAt), { timeout: 15000 })
      .toContain(`【ビジ友】「${JOB_TITLE}」の発注内容が変更されました`);
    await expect
      .poll(() => mailSubjectsSince(TEST_CLIENT.email, startedAt), { timeout: 15000 })
      .toContain(`【ビジ友】「${JOB_TITLE}」の発注内容を変更しました`);
  });
});

test.describe("発注内容を編集できないケース", () => {
  test("完了報告（発注者の評価）が出た応募には編集ボタンが出ず、編集画面も 404", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/orders/${APP_REVIEWED}`);
    await expect(page.getByRole("heading", { name: "発注内容詳細" })).toBeVisible();
    // 発注内容の枠は出るが、編集ボタンは出ない
    await expect(page.getByRole("heading", { name: "発注内容", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "発注内容を編集する" })).toHaveCount(0);

    const res = await page.goto(`/applications/orders/${APP_REVIEWED}/edit`);
    expect(res?.status()).toBe(404);
  });

  test("別の発注者は編集画面を開けない（404）", async ({ page }) => {
    await login(page, TEST_CLIENT2.email, TEST_CLIENT2.password);
    const res = await page.goto(`/applications/orders/${APP_FOR_OWNER}/edit`);
    expect(res?.status()).toBe(404);
  });

  test("受注者本人は編集画面を開けない", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto(`/applications/orders/${APP_FOR_OWNER}/edit`);
    // 発注者向けの画面なので Middleware がマイページへ戻す
    await expect(page).toHaveURL(/\/mypage$/);
    await expect(
      page.getByRole("heading", { name: "発注内容の編集", exact: true }),
    ).toHaveCount(0);
  });
});
