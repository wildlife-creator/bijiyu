import { test, expect, type Page } from "@playwright/test";

import { login, TEST_CLIENT, TEST_CONTRACTOR } from "./helpers";

/**
 * P6 一覧改修（docs/requirements/p6-list-sorting-implementation-notes.md）
 *
 * A. プラン順の既定並び
 *   - CON-005 発注者一覧: ハイエンド → プレミアム → その他（各グループ内は新着順）
 *   - CON-002 案件検索「おすすめ順」: 急募 → ハイエンド → プレミアム → その他（各グループ内は新着順）
 * B. 並び替えプルダウン（共通部品 SortSelect）
 *   - 選択すると URL の ?sort= が変わり即座に並び替わる / ページ番号は 1 に戻る / 検索条件は保持
 *
 * seed（supabase/seed.sql 末尾「P6 一覧改修」ブロック）:
 *   highend-client@test.local = ハイエンド建設株式会社（ハイエンド、users.created_at は 30 日前 = 新着順では先頭に来ない）
 *   案件 ①「ハイエンド急募 那覇市 外壁塗装工事」（急募、5 日前作成）②「ハイエンド 沖縄 内装塗装工事」（急募なし、10 日前作成）
 *   他の seed 発注者はプレミアム以下で created_at = seed 投入時刻（= ①② より新しい）。
 */

const HIGHEND_CLIENT_NAME = "ハイエンド建設株式会社";
const HIGHEND_URGENT_JOB = "ハイエンド急募 那覇市 外壁塗装工事";
const HIGHEND_PLAIN_JOB = "ハイエンド 沖縄 内装塗装工事";
const SUZUKI_JOB_ID = "66666666-6666-6666-6666-666666666666";

/** 並び替えプルダウンで指定ラベルを選ぶ（shadcn Select = trigger click → option click） */
async function chooseSort(page: Page, label: string) {
  await page.getByLabel("並び替え").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/** 一覧カードの見出し（h3）テキストを上から順に取得 */
async function cardTitles(page: Page): Promise<string[]> {
  const texts = await page.locator("h3").allInnerTexts();
  return texts.map((t) => t.trim());
}

test.describe("P6-A: 発注者一覧（CON-005）のプラン順", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("既定（おすすめ順）はハイエンド発注者が先頭、新着順に切り替えると先頭ではなくなる", async ({
    page,
  }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "発注者一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("おすすめ順");

    const recommended = await cardTitles(page);
    expect(recommended[0]).toBe(HIGHEND_CLIENT_NAME);

    await chooseSort(page, "新着順");
    await expect(page).toHaveURL(/sort=newest/);
    await expect(page.getByLabel("並び替え")).toContainText("新着順");
    const newest = await cardTitles(page);
    expect(newest.length).toBeGreaterThan(1);
    // 30 日前に登録したハイエンド発注者は新着順では先頭に来ない（1 ページ目の外に下がる）
    expect(newest[0]).not.toBe(HIGHEND_CLIENT_NAME);
  });

  test("並び替えを変えてもページ番号は 1 に戻り、検索条件は保持される", async ({ page }) => {
    await page.goto("/clients?prefecture=" + encodeURIComponent("沖縄県") + "&page=2");
    await expect(page.getByRole("heading", { name: "発注者一覧" })).toBeVisible();

    await chooseSort(page, "新着順");
    await expect(page).toHaveURL(/sort=newest/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).toHaveURL(new RegExp("prefecture=" + encodeURIComponent("沖縄県")));
    // 沖縄県で募集しているのはハイエンド発注者だけ
    await expect(page.getByText("全1件")).toBeVisible();
    expect((await cardTitles(page))[0]).toBe(HIGHEND_CLIENT_NAME);
  });
});

test.describe("P6-A: 案件検索（CON-002）のおすすめ順", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
  });

  test("既定（おすすめ順）は 急募+ハイエンド → ハイエンド（急募なし）の順。新着順では 2 番目が変わる", async ({
    page,
  }) => {
    await page.goto("/jobs/search");
    await expect(page.getByRole("heading", { name: "募集案件一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("おすすめ順");

    const recommended = await cardTitles(page);
    expect(recommended[0]).toBe(HIGHEND_URGENT_JOB);
    expect(recommended[1]).toBe(HIGHEND_PLAIN_JOB);

    // 新着順: 急募 → 新着（プラン順は使わない）。10 日前作成のハイエンド案件は 2 番目に来ない
    await chooseSort(page, "新着順");
    await expect(page).toHaveURL(/sort=newest/);
    const newest = await cardTitles(page);
    expect(newest[0]).toBe(HIGHEND_URGENT_JOB);
    expect(newest[1]).not.toBe(HIGHEND_PLAIN_JOB);
  });

  test("報酬順に切り替えても検索条件（エリア）と件数は保持され、ページ番号は 1 に戻る", async ({
    page,
  }) => {
    await page.goto(
      "/jobs/search?prefecture=" + encodeURIComponent("沖縄県") + "&page=2",
    );
    await expect(page.getByRole("heading", { name: "募集案件一覧" })).toBeVisible();

    await chooseSort(page, "報酬が高い順");
    await expect(page).toHaveURL(/sort=reward_high/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).toHaveURL(new RegExp("prefecture=" + encodeURIComponent("沖縄県")));
    await expect(page.getByLabel("並び替え")).toContainText("報酬が高い順");
    await expect(page.getByText("全2件")).toBeVisible();
    // 30,000 円（急募案件）> 24,000 円
    const titles = await cardTitles(page);
    expect(titles).toEqual([HIGHEND_URGENT_JOB, HIGHEND_PLAIN_JOB]);

    await chooseSort(page, "報酬が低い順");
    await expect(page).toHaveURL(/sort=reward_low/);
    expect(await cardTitles(page)).toEqual([HIGHEND_PLAIN_JOB, HIGHEND_URGENT_JOB]);
  });

  test("未知の sort 値は既定（おすすめ順）に倒れる", async ({ page }) => {
    await page.goto("/jobs/search?sort=bogus");
    await expect(page.getByLabel("並び替え")).toContainText("おすすめ順");
    expect((await cardTitles(page))[0]).toBe(HIGHEND_URGENT_JOB);
  });
});

test.describe("P6-B: 職人一覧（CLI-005）の並び替え", () => {
  test("新着順（既定）/ 登録が古い順を切り替えられる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/users/contractors");
    await expect(page.getByRole("heading", { name: "職人一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("新着順");
    // 30 日前登録のハイエンド発注者（client role も職人一覧に載る）は新着順では先頭に来ない
    expect((await cardTitles(page))[0]).not.toContain("最上英人");

    await chooseSort(page, "登録が古い順");
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.getByLabel("並び替え")).toContainText("登録が古い順");
    expect((await cardTitles(page))[0]).toContain("最上英人");
  });
});

test.describe("P6-B: 応募・発注系一覧の並び替え（新しい順 / 古い順）", () => {
  test("CON-011 応募履歴: ステータス絞り込みを保持したまま古い順に切り替わる", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/applications/history?filter=" + encodeURIComponent("稼働予定"));
    await expect(page.getByRole("heading", { name: "応募履歴" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("新しい順");

    await chooseSort(page, "古い順");
    await expect(page).toHaveURL(/sort=asc/);
    await expect(page).toHaveURL(new RegExp("filter=" + encodeURIComponent("稼働予定")));
    await expect(page.getByLabel("並び替え")).toContainText("古い順");
  });

  test("CLI-007 応募一覧: 案件絞り込み（jobId）が並び替えで落ちない（旧リンク実装のバグ修正）", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/applications/received?jobId=${SUZUKI_JOB_ID}`);
    await expect(page.getByRole("heading", { name: "応募一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("新しい順");
    const countBefore = await page.getByText(/^全\d+件$/).innerText();

    await chooseSort(page, "古い順");
    await expect(page).toHaveURL(/sort=asc/);
    await expect(page).toHaveURL(new RegExp(`jobId=${SUZUKI_JOB_ID}`));
    await expect(page.getByLabel("並び替え")).toContainText("古い順");
    await expect(page.getByText(countBefore, { exact: true })).toBeVisible();
  });

  test("CLI-010 発注履歴: ステータス絞り込みを保持したまま古い順に切り替わる", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/applications/orders?status=" + encodeURIComponent("取引完了"));
    await expect(page.getByRole("heading", { name: "発注履歴一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("新しい順");

    await chooseSort(page, "古い順");
    await expect(page).toHaveURL(/sort=asc/);
    await expect(page).toHaveURL(new RegExp("status=" + encodeURIComponent("取引完了")));
    await expect(page.getByLabel("並び替え")).toContainText("古い順");
  });

  test("CLI-007B 案件応募者一覧: 古い順に切り替わる", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/jobs/${SUZUKI_JOB_ID}/applicants`);
    await expect(page.getByRole("heading", { name: "案件応募者一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("新しい順");

    await chooseSort(page, "古い順");
    await expect(page).toHaveURL(new RegExp(`/jobs/${SUZUKI_JOB_ID}/applicants\\?.*sort=asc`));
    await expect(page.getByLabel("並び替え")).toContainText("古い順");
  });
});

test.describe("P6-B: 募集現場一覧（CLI-001）の並び替え", () => {
  test("ステータス絞り込みを保持したまま 新着順 / 古い順 を切り替えられる（件数は不変）", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/jobs/manage?status=open");
    await expect(page.getByRole("heading", { name: "募集現場一覧" })).toBeVisible();
    await expect(page.getByLabel("並び替え")).toContainText("新着順");
    const countBefore = await page.getByText(/^全\d+件$/).innerText();

    await chooseSort(page, "古い順");
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page).toHaveURL(/status=open/);
    await expect(page.getByLabel("並び替え")).toContainText("古い順");
    await expect(page.getByText(countBefore, { exact: true })).toBeVisible();

    await chooseSort(page, "新着順");
    await expect(page).toHaveURL(/sort=newest/);
    await expect(page).toHaveURL(/status=open/);
  });
});
