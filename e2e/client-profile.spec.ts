import { expect, test } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_CLIENT2,
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
    // org-scoping-consistency: 会社(org 55555555)単位で集計する。
    // 22222222(Owner)案件 good3+bad1 ＋ 担当者33333333案件 good1 = good4 / total5 = 「4／5件」
    await expect(page.getByText("・また仕事を受けたい")).toBeVisible();
    await expect(page.getByText("（4／5件）")).toBeVisible();
    // 0件メッセージは出ない
    await expect(page.getByText("評判はまだありません")).toHaveCount(0);
  });

  test("個人発注者は被評価者ID軸で集計される（会社単位化されない）", async ({
    page,
  }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
    // org-scoping-consistency: 個人発注者(dd111111, organization_id NULL)は reviewee_id 軸で集計。
    // seed: dd111111 への client_review は good 1件 = 「1／1件」（会社単位化されない非回帰）
    await expect(page.getByText("・また仕事を受けたい")).toBeVisible();
    await expect(page.getByText("（1／1件）")).toBeVisible();
    await expect(page.getByText("評判はまだありません")).toHaveCount(0);
  });

  test("評価0件: 評判はまだありませんを表示する（評価のない会社）", async ({
    page,
  }) => {
    // client2（山田建設・org aabbccdd-5555）には client_reviews が無い → 0件 fail-safe（会社スコープ）
    await login(page, TEST_CLIENT2.email, TEST_CLIENT2.password);
    await page.goto("/mypage/client-profile");
    await expect(
      page.getByRole("heading", { name: "発注者情報詳細" }),
    ).toBeVisible();
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
    // 法人プラン用セットアップバナー（Task 17 で文言変更。バナーの
    // 「社名を入力してください」はバリデーションエラーと同一文字列のため、
    // バナー固有の後半フレーズで照合する）
    await expect(
      page.getByText(/その他の項目は後からいつでも編集できます/),
    ).toBeVisible();
    // スキップボタンは法人プランでは非表示
    await expect(
      page.getByRole("button", { name: "スキップして後で設定する" }),
    ).toHaveCount(0);
    // billing Task 17（仕様変更⑤）: 必須バッジは社名のみ
    // （募集職種・募集エリアは後回し可になったためバッジなし）
    await expect(page.getByText("必須", { exact: true })).toHaveCount(1);

    // 社名を空にして保存しようとするとエラー
    // （setup モードでは button ラベルが「保存する」）
    // react-hook-form の defaultValues 同期完了を待ってから clear する
    // （fill("") は DOM が一瞬空のタイミングで no-op 化されることがある）
    const displayNameInput = page.getByLabel("会社名・氏名");
    await expect(displayNameInput).toHaveValue("鈴木工務店株式会社");
    await displayNameInput.clear();
    await page.getByRole("button", { name: "保存する" }).click();
    // exact: true でバナー（同フレーズを含む長文）を除外しエラー表示のみに一致させる
    await expect(
      page.getByText("社名を入力してください", { exact: true }),
    ).toBeVisible();
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
    await expect(page.getByText(/後から設定することもできます/)).toBeVisible();
    // スキップボタンが表示される
    await expect(
      page.getByRole("button", { name: "スキップして後で設定する" }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// billing Task 17（2026-06-10 仕様変更⑤・2026-06-11 改訂）:
// setup（課金直後）は募集職種・募集エリア未入力可、通常編集（edit）は必須維持
// ---------------------------------------------------------------------------
test.describe("billing Task 17: setup は募集職種・エリア未入力可 / 通常編集は必須", () => {
  test("setup で空のまま保存成功 → 通常編集では必須エラー → 再入力で保存", async ({
    page,
  }) => {
    // seed: 中村リフォーム（個人プラン）= recruit_job_types 2 件 +
    // client_recruit_areas 2 行（埼玉県・東京都 県全域）
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );

    // --- setup モード: 募集職種・エリアを全削除しても保存できる ---
    await page.goto("/mypage/client-profile/edit?setup=true");
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();
    // 非法人プランの setup は必須バッジ 0 個（社名・募集職種・エリアすべて任意）
    await expect(page.getByText("必須", { exact: true })).toHaveCount(0);

    // 親の combobox trigger button の accessible name にも chip テキストが
    // 含まれる（substring match で衝突する）ため exact 指定で chip の × に絞る
    await page
      .getByRole("button", { name: "建築/躯体｜大工 を削除", exact: true })
      .click();
    await page
      .getByRole("button", { name: "建築/内装｜木工 を削除", exact: true })
      .click();
    await page.getByRole("button", { name: "エリア 2 を削除" }).click();
    await page.getByRole("button", { name: "エリア 1 を削除" }).click();

    await page.getByRole("button", { name: "保存する" }).click();
    // setup モードの保存後は /mypage へ
    await page.waitForURL(/\/mypage$/, { timeout: 15000 });

    // --- 通常編集モード: 必須バッジが付き、空のままでは保存できない ---
    await page.goto("/mypage/client-profile/edit");
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();
    // 募集職種・募集エリアに必須バッジ（非法人なので社名にはバッジなし = 2 個）
    await expect(page.getByText("必須", { exact: true })).toHaveCount(2);

    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("募集職種を選択してください")).toBeVisible();
    await expect(page.getByText("募集エリアを選択してください")).toBeVisible();
    // 画面遷移しない（編集画面のまま）
    await expect(
      page.getByRole("heading", { name: "発注者情報編集" }),
    ).toBeVisible();

    // --- 再入力して保存（seed 値に復元） ---
    // 募集職種 2 件（MasterCombobox multi）
    await page.getByRole("button", { name: "募集職種を検索" }).click();
    await page.getByRole("combobox").last().fill("大工");
    await page
      .getByRole("option", { name: "建築/躯体｜大工", exact: true })
      .click();
    await page.getByRole("combobox").last().fill("木工");
    await page
      .getByRole("option", { name: "建築/内装｜木工", exact: true })
      .click();
    await page.keyboard.press("Escape");

    // 募集エリア 2 行（埼玉県・東京都 全域）
    await page.getByRole("button", { name: "+ 県を追加" }).click();
    await page.locator('[data-slot="select-trigger"]').last().click();
    await page.getByRole("option", { name: "埼玉県", exact: true }).click();
    await page.getByLabel("全域").last().check();
    await page.getByRole("button", { name: "+ 県を追加" }).click();
    await page.locator('[data-slot="select-trigger"]').last().click();
    await page.getByRole("option", { name: "東京都", exact: true }).click();
    await page.getByLabel("全域").last().check();

    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/\/mypage\/client-profile$/, { timeout: 15000 });
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
