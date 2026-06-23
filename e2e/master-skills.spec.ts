import { expect, test } from "@playwright/test";

import {
  TEST_CONTRACTOR,
  TEST_CONTRACTOR3,
  TEST_CONTRACTOR4,
  TEST_CLIENT,
  login,
} from "./helpers";

// 注: このファイル内の 5 つのテストは contractor4 / TEST_CLIENT の状態を
// 変更し合うため、バッチ実行する前に必ず `supabase db reset` を実行する。
// テスト同士の衝突を避けるため、各テストは「自分が新しく追加した固有な値」
// を確認するように設計し、開始時の正確な件数には依存しない。

/**
 * Phase 9.3 — master-skills E2E (フォーム入力系 5 シナリオ)
 *
 * 対象:
 *   - 9.3a COM-002 編集経路: 対応職種 3 / 保有スキル 5 / 保有資格 2
 *   - 9.3b 上限なし大量登録: 保有スキル 10 + 保有資格 12
 *   - 9.3c CLI-021 経路: 募集職種 combobox + カテゴリ一括選択
 *   - 9.3d 受注者 SignUp: register/profile → 関連候補 → 保存
 *   - 9.3e CLI-004 → CON-002 検索ヒット
 *
 * 共通操作:
 *   - MasterCombobox: data-slot="master-combobox-trigger" をクリック → 入力 → option クリック
 *   - shadcn Select は selectOption() を使わず getByLabel().click() → getByRole("option").click()
 *   - CategoryBulkSelector: 「カテゴリから一括選択」ボタン → ダイアログ内のチェック → 追加
 */

/**
 * 対応職種行（経験年数 N（年）入力を持つ行）の MasterCombobox trigger を返す。
 *
 * 各 row は `<div class="flex items-start gap-2">` 配下に
 *   - 左: MasterCombobox button[@data-slot="master-combobox-trigger"]
 *   - 右: <input aria-label="経験年数 N（年）">
 * の順で並ぶ。experience 入力 → preceding::button 第 1 で同 row の trigger に到達。
 */
function triggerForTradeRow(
  page: import("@playwright/test").Page,
  rowNum: number,
) {
  return page
    .getByLabel(`経験年数 ${rowNum}（年）`)
    .locator(
      'xpath=preceding::button[@data-slot="master-combobox-trigger"][1]',
    );
}

/**
 * セクション（保有スキル / 保有資格 等）直後の MasterCombobox trigger を返す。
 *
 * `<FieldLabel>${section}</FieldLabel>` の直後に MasterCombobox が 1 個ある
 * 前提（COM-002 / CLI-021 のフォーム構造）。同名 label が画面内で複数出る場合は
 * 呼び出し側で別 locator を使うこと。
 */
function triggerForSection(
  page: import("@playwright/test").Page,
  sectionLabel: string,
) {
  return page
    .getByText(sectionLabel, { exact: true })
    .locator(
      'xpath=following::button[@data-slot="master-combobox-trigger"][1]',
    );
}

/**
 * 指定の MasterCombobox trigger（Locator）を開き、検索語を入力して候補を pick する。
 *
 * 2026-05-20: 旧 API は `triggerIndex: number` だったが、Phase 4.4 で AreaListEditor
 * 追加後にフォーム内の `[data-slot="master-combobox-trigger"]` 個数が変わり index
 * が常時ずれるため、Locator 直渡しに変更。呼び出し側は `triggerForTradeRow()` /
 * `triggerForSection()` 等の semantic helper で trigger を組み立てる。
 */
async function pickMasterComboboxOption(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  searchText: string,
  optionLabel: string,
) {
  await trigger.click();
  // cmdk Input — 「placeholder のテキストで入力欄を見つけ、検索文字を入力
  const input = page.getByRole("combobox").or(page.locator('input[role="combobox"]')).last();
  await input.fill(searchText);
  await page.getByRole("option", { name: optionLabel }).click();
}

// 7 件の skill_tag (contractor4 既存 3 と合わせて 10 件)
const SKILL_TAGS_PLUS_7: Array<{ search: string; label: string }> = [
  { search: "alc", label: "alc工" },
  { search: "アーク", label: "アーク溶接" },
  { search: "アスファルト防水工", label: "アスファルト防水工" },
  { search: "アスベスト", label: "アスベスト除去工" },
  { search: "ウレタン防水工", label: "ウレタン防水工" },
  { search: "インテリア", label: "インテリア" },
  { search: "エクステリア", label: "エクステリア工（外構工）" },
];

// 12 件の qualification
const QUALS_12: Array<{ search: string; label: string }> = [
  { search: "1級いす張り", label: "1級いす張り作業技能士" },
  { search: "1級カーペット系", label: "1級カーペット系床仕上げ工事作業技能士" },
  { search: "1級かわらぶき", label: "1級かわらぶき作業技能士" },
  { search: "1級ダクト", label: "1級ダクト板金作業技能士" },
  { search: "1級パーカッション", label: "1級パーカッション式さく井工事作業技能士" },
  { search: "1級プラスチック", label: "1級プラスチック系床仕上げ工事作業技能士" },
  { search: "1級ボード", label: "1級ボード仕上げ工事作業技能士" },
  { search: "1級ボイラー", label: "1級ボイラー技士" },
  { search: "1級ロータリー", label: "1級ロータリー式さく井工事作業技能士" },
  { search: "1級内装仕上げ施工技能士", label: "1級内装仕上げ施工技能士（化粧フィルム工事作業）" },
  { search: "1級厨房設備", label: "1級厨房設備施工作業技能士" },
  { search: "1級土木施工管理", label: "1級土木施工管理技士" },
];

// ============================================================================
// 9.3a COM-002 編集経路
// ============================================================================
test.describe("9.3a COM-002 編集経路 (master-skills)", () => {
  test("対応職種 3 件 / 保有スキル 5 件 / 保有資格 2 件を入力し COM-001 で表示確認", async ({
    page,
  }) => {
    // contractor4 (小林さくら) の seed 開始状態: trades 1 / skills 3 / quals 0
    // 「3 件 / 5 件 / 2 件」へ到達するように追加入力する
    await login(page, TEST_CONTRACTOR4.email, TEST_CONTRACTOR4.password);

    await page.goto("/profile/edit");
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール編集" }),
    ).toBeVisible();

    // ─── 対応職種を 3 件にする (既存 1 + 追加 2) ────────────────────────
    // 既存 row 0 はそのまま (内装｜木工)。「職種を追加」を 2 回押して 3 行にする。
    await page.getByRole("button", { name: "職種を追加" }).click();
    await page.getByRole("button", { name: "職種を追加" }).click();

    // 2 行目: 屋根工 を選択
    await pickMasterComboboxOption(
      page,
      triggerForTradeRow(page, 2),
      "屋根",
      "建築/躯体｜屋根（瓦）",
    );
    await page
      .getByLabel("経験年数 2（年）")
      .fill("3");

    // 3 行目: 塗装工 を選択
    await pickMasterComboboxOption(
      page,
      triggerForTradeRow(page, 3),
      "塗装",
      "建築/仕上げ｜塗装工",
    );
    await page
      .getByLabel("経験年数 3（年）")
      .fill("2");

    // ─── 保有スキルを 5 件にする (既存 3 + 追加 2) ───────────────────────
    // multi モードの MasterCombobox はピック後もポップアップが開いたままなので、
    // trigger を 1 回開いたら以降は fill → option click を繰り返すだけ。
    // position 指定: 既存 chip の × ボタンを誤爆しないよう左上 padding 内 (px-3 py-2 内側) を狙う。
    await triggerForSection(page, "保有スキル").click({ position: { x: 5, y: 5 } });
    await page.locator('input[role="combobox"]').last().fill("型枠設置");
    await page.getByRole("option", { name: "型枠設置" }).first().click();
    await page.locator('input[role="combobox"]').last().fill("型枠解体");
    await page.getByRole("option", { name: "型枠解体工" }).first().click();
    // ポップアップを閉じる (次の combobox に進む前に)
    await page.keyboard.press("Escape");

    // ─── 保有資格を 2 件追加 (既存 0 + 追加 2) ─────────────────────────────
    await triggerForSection(page, "保有資格").click({ position: { x: 5, y: 5 } });
    await page.locator('input[role="combobox"]').last().fill("2級建築士");
    await page.getByRole("option", { name: "2級建築士", exact: true }).first().click();
    await page.locator('input[role="combobox"]').last().fill("玉掛");
    await page.getByRole("option", { name: "玉掛技能者（1t以上）" }).first().click();
    await page.keyboard.press("Escape");

    // ─── 保存 ─────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 15000 });

    // ─── COM-001 表示確認 ────────────────────────────────────────────────
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール" }),
    ).toBeVisible();

    // 対応職種 (3 件) — 既存 + 追加分が全て見える
    await expect(page.getByText("建築/内装｜木工", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("建築/躯体｜屋根（瓦）", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("建築/仕上げ｜塗装工", { exact: false }).first()).toBeVisible();

    // 保有スキル (5 件): 既存 3 + 追加 2
    await expect(page.getByText("壁装（クロス）工", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("型枠設置", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("型枠解体工", { exact: false }).first()).toBeVisible();

    // 保有資格 (2 件)
    await expect(page.getByText("2級建築士", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("玉掛技能者（1t以上）", { exact: false }).first()).toBeVisible();

    // 件数が initialLimit (5 / 8 / 5) を超えていないので「もっと見る」は出ない
    await expect(
      page.getByRole("button", { name: "もっと見る" }),
    ).toHaveCount(0);
  });
});

// ============================================================================
// 9.3b 上限なし大量登録: 保有スキル 10 + 保有資格 12
// ============================================================================
test.describe("9.3b 上限なし大量登録 (master-skills)", () => {
  test("保有スキル 10 件 + 保有資格 12 件を 1 回保存 → COM-001 で「もっと見る」展開して全件表示", async ({
    page,
  }) => {
    // contractor1 (田中) 開始: trades 2 / skill_tags 4 / quals 2
    // 目標: skills 11 (4 + 7) / quals 14 (2 + 12) — initialLimit 8 / 5 をどちらも超える
    // 9.3a が contractor4 を変更するため、9.3b は contractor1 を使い state pollution を避ける
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);

    await page.goto("/profile/edit");
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール編集" }),
    ).toBeVisible();

    // ─── 保有スキル: +7 件 ─────────────────────────────────────────────────
    await triggerForSection(page, "保有スキル").click();
    for (const { search, label } of SKILL_TAGS_PLUS_7) {
      await page.getByRole("combobox").last().fill(search);
      await page.getByRole("option", { name: label, exact: true }).first().click();
    }
    await page.keyboard.press("Escape");

    // ─── 保有資格: +12 件 ─────────────────────────────────────────────────
    await triggerForSection(page, "保有資格").click();
    for (const { search, label } of QUALS_12) {
      await page.getByRole("combobox").last().fill(search);
      await page.getByRole("option", { name: label, exact: true }).first().click();
    }
    await page.keyboard.press("Escape");

    // ─── 保存 ──────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 15000 });

    // ─── COM-001 で「もっと見る」が表示される ───────────────────────────
    // 保有スキル 10 (>8) / 保有資格 12 (>5) でどちらも収まらない
    const showMoreButtons = page.getByRole("button", { name: "もっと見る" });
    // 少なくとも 2 個 (保有スキル + 保有資格) は出ているはず
    await expect(showMoreButtons).toHaveCount(2);

    // 折りたたまれた状態では追加項目の一部は見えない (8 件目以降)
    // 全件表示には全 「もっと見る」を展開する必要がある
    const count = await showMoreButtons.count();
    for (let i = 0; i < count; i++) {
      // 毎クリックで DOM が変わり順序がシフトするため、常に最初の「もっと見る」をクリック
      await page.getByRole("button", { name: "もっと見る" }).first().click();
    }

    // 全件展開後: 追加した全項目が見えるはず
    for (const { label } of SKILL_TAGS_PLUS_7) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
    for (const { label } of QUALS_12) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });
});

// ============================================================================
// 9.3d 関連候補 (RelatedSuggestions) — 同じ中カテ配下の sibling 提示
// ============================================================================
// 注: 新規 SignUp フロー (email magic link → password set → register/profile)
// は E2E では複雑すぎるため、同じ RelatedSuggestions コンポーネントを使う
// COM-002 (受注者プロフィール編集) で動作確認する。register/profile と
// COM-002 の双方で同コンポーネントを使う実装になっている。
test.describe("9.3d 関連候補 (RelatedSuggestions)", () => {
  test("対応職種を選ぶと同じ中カテの sibling が候補として提示され、追加 row として取り込める", async ({
    page,
  }) => {
    // contractor3 (渡辺) 開始: trades 2 (設備/施工｜電気 + 配管工(塩ビ管))。
    // 9.3a/9.3b で他ユーザーが変更されているため衝突回避に contractor3 を使う。
    // 大工系の trade は持っていないので、関連候補テストの題材として最適。
    await login(page, TEST_CONTRACTOR3.email, TEST_CONTRACTOR3.password);

    await page.goto("/profile/edit");
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール編集" }),
    ).toBeVisible();

    // 「職種を追加」で新規 row を作り、躯体カテゴリの職種をピックする
    await page.getByRole("button", { name: "職種を追加" }).click();

    // 3 行目で 「建築/躯体｜大工」を選択 → 関連候補が出る
    await pickMasterComboboxOption(
      page,
      triggerForTradeRow(page, 3),
      "大工",
      "建築/躯体｜大工",
    );

    // 関連候補ボックスが表示される
    await expect(
      page.getByText(/関連候補/),
    ).toBeVisible();

    // sibling として「建築/躯体｜宮大工」ボタンがあるはず
    const siblingButton = page.getByRole("button", {
      name: "建築/躯体｜宮大工",
    });
    await expect(siblingButton).toBeVisible();

    // sibling をクリックすると新規 row として追加される
    await siblingButton.click();

    // 4 行目が増えていることを確認: 「経験年数 4（年）」 input が存在
    await expect(page.getByLabel("経験年数 4（年）")).toBeVisible();

    // 経験年数を入力
    await page.getByLabel("経験年数 3（年）").fill("5");
    await page.getByLabel("経験年数 4（年）").fill("2");

    // 保存 → COM-001 で 大工 + 宮大工 + 既存 trades が表示される
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/profile$/, { timeout: 15000 });

    await expect(page.getByText("建築/躯体｜大工").first()).toBeVisible();
    await expect(page.getByText("建築/躯体｜宮大工").first()).toBeVisible();
    // contractor3 の既存 trade も表示される
    await expect(
      page.getByText("設備/施工｜電気（その他全般）").first(),
    ).toBeVisible();
  });
});

// ============================================================================
// 9.3c CLI-021 経路: MasterCombobox + CategoryBulkSelector
// ============================================================================
test.describe("9.3c CLI-021 経路 (master-skills)", () => {
  test("募集職種 combobox + カテゴリ一括選択「建築/躯体」追加 → 保存 → CLI-020 で表示確認", async ({
    page,
  }) => {
    // TEST_CLIENT (鈴木工務店) の既存 recruit_job_types:
    //   ["建築/躯体｜大工", "建築/内装｜木工", "設備/施工｜電気（その他全般）"]
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    await page.goto("/mypage/client-profile/edit");
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();

    // ─── MasterCombobox で 1 件追加 ────────────────────────────────────
    // CLI-021 の最初の MasterCombobox は「募集職種」(trigger index 0)
    await page.locator('[data-slot="master-combobox-trigger"]').first().click();
    await page.getByRole("combobox").last().fill("塗装");
    await page
      .getByRole("option", { name: "建築/仕上げ｜塗装工" })
      .first()
      .click();
    await page.keyboard.press("Escape");

    // ─── CategoryBulkSelector で「建築/躯体」中カテ一括追加 ─────────────
    await page.getByRole("button", { name: "カテゴリで一括選択" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // 躯体 中カテをチェック (Radix Checkbox: role="checkbox")
    await page.getByRole("checkbox", { name: "躯体" }).click();
    // 追加件数表示: 「N 件追加」(既存 大工 はスキップされる)
    await expect(page.getByText(/\d+ 件追加/)).toBeVisible();
    await page.getByRole("button", { name: "追加する" }).click();
    // ダイアログが閉じる
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // ─── 保存 ──────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/mypage\/client-profile$/, { timeout: 15000 });

    // ─── CLI-020 表示確認 ────────────────────────────────────────────
    // 既存 3 + combobox 1 + 一括追加多数 → initialLimit=5 を超えるので「もっと見る」展開
    await expect(page.getByText("建築/躯体｜大工").first()).toBeVisible();
    const showMore = page.getByRole("button", { name: "もっと見る" });
    if ((await showMore.count()) > 0) {
      await showMore.first().click();
    }
    // 追加した項目が全部見える
    await expect(
      page.getByText("建築/仕上げ｜塗装工").first(),
    ).toBeVisible();
    // 一括追加で「躯体」中カテ配下の他職種が増えていることを確認
    await expect(page.getByText("建築/躯体｜宮大工").first()).toBeVisible();
  });
});

// ============================================================================
// 9.3e CLI-004 案件作成 → CON-002 検索で投稿案件がヒット
// ============================================================================
test.describe("9.3e CLI-004 案件作成 → CON-002 検索ヒット", () => {
  test("trade_types 2 件で公開した案件が CON-002 (/jobs/search) でヒットする", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    await page.goto("/jobs/create");
    await expect(
      page.getByRole("heading", { name: "募集現場新規登録", level: 1 }),
    ).toBeVisible();

    // ─── 必須項目を埋める ─────────────────────────────────────────────
    const uniqueTitle = `E2E-9.3e-案件-${Date.now()}`;
    await page.locator('input[name="title"]').fill(uniqueTitle);
    await page.locator('textarea[name="description"]').fill(
      "9.3e E2E テスト用の案件です。",
    );

    await page.locator('input[name="rewardUpper"]').fill("25000");
    await page.locator('input[name="rewardLower"]').fill("18000");

    // エリア (master-area-multi-select Phase C 以降: AreaListEditor は初期空配列。
    // 「+ 県を追加」で 1 行追加 → 都道府県 Select → 「全域」Checkbox で県全域指定)
    await page.getByRole("button", { name: "+ 県を追加" }).click();
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole("option", { name: "東京都", exact: true }).click();
    await page.getByLabel("全域").check();

    // 募集職種 (MasterCombobox multi, 2 件)
    // AreaListEditor が disabled な 市区町村 master-combobox-trigger を 1 個追加するため、
    // 「募集職種」セクションラベルが「募集職種 必須」となり exact マッチが効かない。
    // MasterCombobox の placeholder「募集職種を検索」が trigger の accessible name に
    // なるため、accessible name 経由で一意に解決する（value 未選択時のみ有効）。
    await page.getByRole("button", { name: "募集職種を検索" }).click();
    await page.getByRole("combobox").last().fill("大工");
    await page.getByRole("option", { name: "建築/躯体｜大工" }).first().click();
    await page.getByRole("combobox").last().fill("塗装");
    await page.getByRole("option", { name: "建築/仕上げ｜塗装工" }).first().click();
    await page.keyboard.press("Escape");

    await page.locator('input[name="headcount"]').fill("3");

    // 日付類
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const plus = (n: number) => fmt(new Date(today.getTime() + n * 86400000));
    await page.locator('input[type="date"]').nth(0).fill(plus(7)); // workStartDate
    await page.locator('input[type="date"]').nth(1).fill(plus(30)); // workEndDate
    await page.locator('input[type="date"]').nth(2).fill(fmt(today)); // recruitStartDate
    await page.locator('input[type="date"]').nth(3).fill(plus(14)); // recruitEndDate

    await page.locator('input[name="workHours"]').fill("8:00〜17:00");

    // ─── 公開する ─────────────────────────────────────────────────────
    await page.getByRole("button", { name: "公開する" }).click();
    // /jobs/{id}?manage=true に遷移
    await page.waitForURL(/\/jobs\/[0-9a-f-]+\?manage=true/, { timeout: 20000 });

    // ─── CON-002 検索でヒット確認 ──────────────────────────────────────
    await page.goto("/jobs/search?tradeType=" + encodeURIComponent("建築/躯体｜大工"));
    await expect(page.getByText(uniqueTitle).first()).toBeVisible();
  });
});
