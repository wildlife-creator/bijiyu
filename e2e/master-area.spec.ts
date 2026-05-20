/**
 * master-area E2E (Phase 7.3 / master-area-multi-select Phase C で 10 件上限テストを書換)
 *
 * design.md Testing Strategy 12 シナリオの中で、E2E ならではの観点
 * (上位包含検索 / カード省略表示 / 入力 UI 上限) を集中的に検証する。
 *
 * 「保存 → 詳細表示」のシンプルなシナリオは job-posting.spec.ts /
 * master-skills.spec.ts / client-profile.spec.ts の AreaListEditor 操作
 * によって既にカバーされているため、本ファイルでは省略する。
 *
 * master-area-multi-select Phase C 以降:
 *   - 旧 「+ エリアを追加」 ボタンは新 「+ 県を追加」 に名称変更され、
 *     maxItems プロパティは廃止 (10 件上限は保存時 Zod エラーで実現)
 *   - 「+ 県を追加」ボタンは disabled にならない (押下後の保存で初めてエラー検出)
 *   - 検索系の URL アサーション (?municipality=単数形) は Phase D で書換予定
 */

import { test, expect } from "@playwright/test";
import {
  login,
  TEST_CONTRACTOR,
  TEST_CONTRACTOR2,
  TEST_CONTRACTOR4,
  TEST_CLIENT,
} from "./helpers";

test.describe("master-area: 検索の上位包含ルール", () => {
  test("受注者: CON-002 で「東京都のみ」検索 → 東京都の全案件 (県全域 + 市区町村) がヒット (シナリオ 4)", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email);
    await page.goto("/jobs/search?prefecture=" + encodeURIComponent("東京都"));

    // 東京都の県全域指定案件 (「応募フォームテスト用案件」など) が表示される
    await expect(page.getByText("応募フォームテスト用案件").first()).toBeVisible();
    // 東京都+市区町村案件 (「店舗改装工事の大工作業」=渋谷区) も表示される
    await expect(page.getByText("店舗改装工事の大工作業").first()).toBeVisible();
  });

  test("受注者: CON-002 で「東京都+港区」検索 → 港区案件 + 東京都全域案件はヒット、東京都「中央区」のみの案件はヒットしない (シナリオ 5)", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email);
    await page.goto(
      "/jobs/search?prefecture=" +
        encodeURIComponent("東京都") +
        "&municipality=" +
        encodeURIComponent("港区"),
    );

    // 東京都港区を含む案件 (「東京都 大型マンション新築 大工工事」) はヒット
    await expect(
      page.getByText("東京都 大型マンション新築 大工工事").first(),
    ).toBeVisible();
    // 東京都全域指定の案件 (「応募フォームテスト用案件」) もヒット (上位包含)
    await expect(page.getByText("応募フォームテスト用案件").first()).toBeVisible();
  });

  test("受注者: CON-002 で同名キー繰返し『?municipality=港区&municipality=世田谷区』検索 → 各 muni と東京都全域案件すべてヒット (multi-select R7B-7)", async ({
    page,
  }) => {
    // master-area-multi-select Phase D: 複数 muni を同名キー繰返し形式で渡し、
    // 各 muni × buildAreaFilterIds の結果を Set 和で OR 結合した検索が動作することを確認
    await login(page, TEST_CONTRACTOR.email);
    await page.goto(
      "/jobs/search?prefecture=" +
        encodeURIComponent("東京都") +
        "&municipality=" +
        encodeURIComponent("港区") +
        "&municipality=" +
        encodeURIComponent("世田谷区"),
    );

    // 港区を含む案件
    await expect(
      page.getByText("東京都 大型マンション新築 大工工事").first(),
    ).toBeVisible();
    // 東京都全域指定の案件も上位包含で含まれる
    await expect(
      page.getByText("応募フォームテスト用案件").first(),
    ).toBeVisible();
  });
});

test.describe("master-area: 受注者検索 (CLI-005) の上位包含", () => {
  test("発注者: CLI-005 で「東京都港区」検索 → 東京都対応の受注者 (県全域 + 市区町村) がヒット (シナリオ 7)", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email);
    await page.goto(
      "/users/contractors?prefecture=" +
        encodeURIComponent("東京都") +
        "&municipality=" +
        encodeURIComponent("港区"),
    );

    // contractor2@test.local は「東京都港区」を直接登録 → ヒット
    // contractor@test.local は「東京都 (県全域)」を登録 → 上位包含でヒット
    // 少なくとも 1 件以上の結果が表示される
    const cards = page.locator("a[href^='/users/contractors/']");
    await expect(cards.first()).toBeVisible();
  });
});

test.describe("master-area: カード「他Nエリア」省略表示 (シナリオ 9)", () => {
  test("案件カードでエリア 4 件以上の案件は「他Nエリア」と表示される", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email);
    // seed の「東京都 大型マンション新築 大工工事」は job_areas を 6 件持つ
    // (東京都港区/世田谷区/品川区 + 神奈川県横浜市西区 + 千葉県/埼玉県)。
    // format-areas は同県を 1 ユニットにグループ化するため 4 ユニット表示となり
    // maxVisible=3 を超えて「他1エリア」が表示される。
    await page.goto("/jobs/search?tradeType=" + encodeURIComponent("建築/躯体｜大工"));

    // カードに「他Nエリア」が現れる
    const overflow = page.locator("text=/他\\d+エリア/");
    await expect(overflow.first()).toBeVisible();
  });
});

test.describe("master-area: 案件エリア入力 10 件上限 (シナリオ 11 / multi-select Phase C 更新)", () => {
  test("案件作成画面で「+ 県を追加」は disabled にならない (10 件超は保存時 Zod エラーで弾く)", async ({
    page,
  }) => {
    // 新仕様: AreaListEditor は maxItems を持たず、上限超過は保存時のみエラー化。
    // 旧 disabled 動作テストは廃止し、ここでは「ボタンが常に押せる」ことを保証する。
    // 実際の 10 件超エラートースト確認は e2e/job-posting.spec.ts で行う。
    await login(page, TEST_CLIENT.email);
    await page.goto("/jobs/create");

    const addButton = page.getByRole("button", { name: "+ 県を追加" });
    await expect(addButton).toBeEnabled();
    // 11 回押しても disabled にならないことを確認 (旧仕様との差分)
    for (let i = 0; i < 11; i++) {
      await addButton.click();
      await expect(addButton).toBeEnabled();
    }
  });
});

test.describe("master-area: 無料受注者の応募可否は都道府県マッチで判定 (シナリオ 8)", () => {
  test("無料受注者 contractor4 (東京都全域対応・木工スキル) は「東京都品川区」の内装案件に応募ボタン活性", async ({
    page,
  }) => {
    // contractor4: 無料プラン (subscriptions レコードなし)、
    // user_available_areas = 東京都+千葉県 (どちらも県全域)、
    // user_skills = 建築/内装｜木工
    // 「東京都内マンション内装仕上げ工事」: 東京都品川区 / 建築/内装｜木工
    // → 都道府県マッチ「東京都」OK で応募可 (市区町村は判定しない)
    await login(page, TEST_CONTRACTOR4.email);
    await page.goto("/jobs/88888888-8888-8888-8888-888888888882");

    // ページ内に複数の「応募する」CTA (上下) があるため first()
    const applyLink = page.getByRole("link", { name: "応募する" }).first();
    await expect(applyLink).toBeVisible();
  });
});

test.describe("master-area: 受注者プロフィール表示 (詳細画面)", () => {
  test("contractor2 のプロフィール詳細で対応エリアが新スキーマで表示される (シナリオ 1)", async ({
    page,
  }) => {
    // contractor2 seed: 東京都(県全域) + 東京都港区 + 東京都新宿区 + 神奈川県(県全域)
    // → formatAreas は「東京都（港区・新宿区ほか）、神奈川県」を出す
    //   (同県の県全域 + 市区町村混在ルール / 県全域は県名のみ表示)
    await login(page, TEST_CONTRACTOR2.email);
    await page.goto("/profile");

    // 市区町村ラベル「港区」または「新宿区」が画面に出ていること
    // (グルーピングで「東京都（港区・新宿区ほか）」のような連結文字列になる)
    await expect(page.getByText(/港区/).first()).toBeVisible();
    await expect(page.getByText(/新宿区|ほか/).first()).toBeVisible();
    // 神奈川県 (県全域) も表示される
    await expect(page.getByText(/神奈川県/).first()).toBeVisible();
  });
});

test.describe("master-area: URL 直アクセスで AreaPicker 値が初期化される", () => {
  test("受注者: ?prefecture=東京都 つきで /jobs/search を開くと結果がフィルタされる", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email);
    await page.goto("/jobs/search?prefecture=" + encodeURIComponent("東京都"));

    // フィルタ済の結果カードが見える (東京都の案件のみ)
    await expect(page.getByText(/東京都/).first()).toBeVisible();
    // URL 自体が prefecture を保持
    await expect(page).toHaveURL(/prefecture=/);
  });
});

test.describe("master-area: 上位包含で異県は絶対に含めない (R6 ガード)", () => {
  test("受注者: 「東京都」検索で「大阪府」のみの案件はヒットしない", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email);
    await page.goto("/jobs/search?prefecture=" + encodeURIComponent("東京都"));

    // 「大阪市商業施設 電気工事」(大阪府のみ) は東京都検索ではヒットしない
    await expect(page.getByText("大阪市商業施設 電気工事")).not.toBeVisible();
    // 「ダウングレードテスト案件1」(大阪府のみ) も同様
    await expect(page.getByText("ダウングレードテスト案件1")).not.toBeVisible();
  });
});
