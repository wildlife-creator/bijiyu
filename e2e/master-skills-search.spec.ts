import { expect, test } from "@playwright/test";

import {
  TEST_CONTRACTOR,
  TEST_CONTRACTOR3,
  TEST_CLIENT,
  TEST_STAFF,
  login,
} from "./helpers";

/**
 * Phase 9.4 — master-skills E2E (検索・閲覧・廃止・制限系 5 シナリオ)
 *
 * 9.3 がフォーム入力系（COM-002 / CLI-021 / job-form / register/profile）を扱うのに対し、
 * 本ファイルは下流の読取系を扱う:
 *
 *   - 9.4a CON-002 案件検索: jobs.trade_types への `.overlaps()` で OR 一致
 *   - 9.4b CLI-005 ユーザー検索: 3 マスタへの OR 一致（TRADE_TYPES 誤用バグ非再発）
 *   - 9.4c CON-005 発注者検索: client_profiles.recruit_job_types `.overlaps()` + `!inner`
 *   - 9.4d 廃止項目: 編集画面でのみ（廃止）サフィックス / 検索候補からは除外 /
 *     表示専用画面はサフィックス無し
 *   - 9.4e Staff の応募ボタン非表示と /apply 多層防御（middleware redirect）
 *
 * 起動前提:
 *   - `supabase db reset` で seed を取り直す（9.4d は seed.sql の deprecated_at 倒しに依存）
 *   - `npm run dev` を「seed 適用後に」起動する（master fetch は unstable_cache 配下で
 *     プロセスローカルに 1 時間保持されるため、古い dev プロセスでは deprecated 表示が
 *     反映されない可能性がある）
 */

// =============================================================================
// 共通ヘルパ
// =============================================================================

/**
 * SearchFilterSheet（aria-label="検索条件" のアイコンボタン）を開く。
 * 各検索画面は同じ Sheet UI を共有する。
 */
async function openFilterSheet(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "検索条件" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * MasterCombobox の trigger を開いて popover を立ち上げる。
 * mode="multi" は pick 後も popover が開いたままなので、複数 pick したい場合は
 * この helper で一度だけ open し、`pickOpenedComboboxOption` を必要回数呼び出す。
 *
 * **scope**: SearchFilterSheet の <dialog> 配下に限定する。一覧ページ本体には
 * 案件カード等で同名テキスト（例: "募集職種"）が散在するため、scope を切らずに
 * `following::button[@data-slot="master-combobox-trigger"][1]` を走らせると、
 * ページ本体の text node から見て dialog 内の最初の trigger（多くの場合
 * AreaPicker 由来の disabled な「市区町村は任意」ボタン）にもヒットして
 * strict-mode violation を起こす (Phase 4.4 で AreaPicker 追加後に発生)。
 *
 * @param triggerLabel  trigger を特定するための「直前の <Label>」テキスト
 * @param inputPlaceholder  cmdk Input の placeholder（open 完了の判定に使う）
 */
async function openLabeledCombobox(
  page: import("@playwright/test").Page,
  triggerLabel: string,
  inputPlaceholder: string,
) {
  const dialog = page.getByRole("dialog");
  const trigger = dialog
    .getByText(triggerLabel, { exact: true })
    .locator(
      'xpath=following::button[@data-slot="master-combobox-trigger"][1]',
    );
  await trigger.click();
  await page.getByPlaceholder(inputPlaceholder).last().waitFor({
    state: "visible",
  });
}

/**
 * 開いている cmdk popover で検索 + option pick。popover は閉じずに残る（multi）。
 * 入力欄は placeholder で確実に特定する（shadcn Select の trigger と区別するため）。
 */
async function pickOpenedComboboxOption(
  page: import("@playwright/test").Page,
  inputPlaceholder: string,
  searchText: string,
  optionLabel: string,
) {
  const input = page.getByPlaceholder(inputPlaceholder).last();
  await input.fill(searchText);
  const option = page
    .getByRole("option", { name: optionLabel, exact: true })
    .first();
  await option.waitFor({ state: "visible" });
  await option.click();
}

// =============================================================================
// 9.4a CON-002 案件検索: trade_types overlap
// =============================================================================
test.describe("9.4a CON-002 案件検索 (trade_types overlap)", () => {
  test("募集職種 2 件を選択して検索すると URL に 2 つの tradeType が反映され、いずれかの trade_type を含む案件のみがヒットする", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);

    // マイページ → CON-002 への導線スモーク（mypage-navigation のロール別導線テストを継承）
    await expect(page.getByRole("heading", { name: "マイページ" })).toBeVisible();
    await page.getByRole("link", { name: "募集案件一覧" }).first().click();
    await page.waitForURL(/\/jobs\/search/);
    await expect(
      page.getByRole("heading", { name: "募集案件一覧" }),
    ).toBeVisible();

    // フィルター Sheet を開いて募集職種 2 件を選ぶ
    await openFilterSheet(page);
    await openLabeledCombobox(page, "募集職種", "募集職種を検索");
    await pickOpenedComboboxOption(
      page,
      "募集職種を検索",
      "塗装",
      "建築/仕上げ｜塗装工",
    );
    await pickOpenedComboboxOption(
      page,
      "募集職種を検索",
      "大工",
      "建築/躯体｜大工",
    );
    await page.keyboard.press("Escape");

    // 検索実行 → Sheet が閉じて URL に反映
    await page.getByRole("button", { name: "検索する" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.waitForURL(/tradeType=.*tradeType=/);

    const url = new URL(page.url());
    expect(url.searchParams.getAll("tradeType")).toEqual(
      expect.arrayContaining(["建築/仕上げ｜塗装工", "建築/躯体｜大工"]),
    );

    // 一致する案件（横浜市 住宅塗装工事 + 大型マンション新築 大工工事）が表示される
    await expect(
      page.getByText("横浜市 住宅塗装工事").first(),
    ).toBeVisible();
    await expect(
      page
        .getByText("東京都 大型マンション新築 大工工事")
        .first(),
    ).toBeVisible();

    // 「木造住宅の内装リフォーム工事」（trade_types=['建築/内装｜木工'] のみ）は
    // overlap 条件に合わないので非表示
    await expect(
      page.getByText("木造住宅の内装リフォーム工事"),
    ).toHaveCount(0);
  });
});

// =============================================================================
// 9.4b CLI-005 ユーザー検索: 3 マスタへの OR 一致
// =============================================================================
test.describe("9.4b CLI-005 ユーザー検索 (3 マスタ filter)", () => {
  test("対応職種 + 保有スキル + 保有資格 を multi 選択 → URL searchParams 反映 → 該当受注者がヒット", async ({
    page,
  }) => {
    // CLI-005 は client / staff のみアクセス可
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    await page.goto("/users/contractors");
    await expect(
      page.getByRole("heading", { name: "職人一覧" }),
    ).toBeVisible({ timeout: 10000 });

    await openFilterSheet(page);

    // 田中一郎が持つ skill_tag「造作大工」 と trade「建築/躯体｜大工」と
    // qualification「1級建築士」を全て持っている前提で OR ではなく AND 的な絞り込み
    // を実証する（実装は各マスタ内 OR、別マスタ間は AND）。
    await openLabeledCombobox(page, "対応職種", "対応職種を検索");
    await pickOpenedComboboxOption(
      page,
      "対応職種を検索",
      "大工",
      "建築/躯体｜大工",
    );
    await page.keyboard.press("Escape");

    await openLabeledCombobox(page, "保有スキル", "保有スキルを検索");
    await pickOpenedComboboxOption(
      page,
      "保有スキルを検索",
      "造作大工",
      "造作大工",
    );
    await page.keyboard.press("Escape");

    await openLabeledCombobox(page, "保有資格", "保有資格を検索");
    await pickOpenedComboboxOption(
      page,
      "保有資格を検索",
      "1級建築士",
      "1級建築士",
    );
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "検索する" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.waitForURL(
      /tradeType=.*skillTag=.*qualification=/,
    );

    const url = new URL(page.url());
    expect(url.searchParams.getAll("tradeType")).toContain(
      "建築/躯体｜大工",
    );
    expect(url.searchParams.getAll("skillTag")).toContain("造作大工");
    expect(url.searchParams.getAll("qualification")).toContain(
      "1級建築士",
    );

    // 3 条件を全て満たすのは「田中一郎」のみ
    await expect(
      page.getByRole("heading", { name: /田中一郎/ }),
    ).toBeVisible();

    // 「高橋美咲」は塗装工で 1級建築士を持たない → ヒットしない
    await expect(
      page.getByRole("heading", { name: /高橋美咲/ }),
    ).toHaveCount(0);
  });
});

// =============================================================================
// 9.4c CON-005 発注者検索: recruit_job_types overlap + !inner join
// =============================================================================
test.describe("9.4c CON-005 発注者検索 (recruit_job_types overlap + !inner)", () => {
  test("募集職種 2 件で検索 → client_profiles.recruit_job_types に overlap する発注者のみがヒット", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);

    await page.goto("/clients");
    await expect(
      page.getByRole("heading", { name: "発注者一覧" }),
    ).toBeVisible({ timeout: 10000 });

    await openFilterSheet(page);
    // 同ファイル 9.3c が TEST_CLIENT (鈴木工務店) の recruit_job_types を増やすため、
    // 9.3 と 9.4 を同バッチで通すと「鈴木工務店が条件外」というアサートが破綻する。
    // ここでは 9.3c が触らない 木工 + 電気 を使い、鈴木 (常に保持) と 中村 (木工保持)
    // がヒット / 山田 (両方なし) が非ヒット、で結果を固定する。
    await openLabeledCombobox(page, "募集職種", "募集職種を検索");
    await pickOpenedComboboxOption(
      page,
      "募集職種を検索",
      "木工",
      "建築/内装｜木工",
    );
    await pickOpenedComboboxOption(
      page,
      "募集職種を検索",
      "電気",
      "設備/施工｜電気（その他全般）",
    );
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "検索する" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.waitForURL(/tradeType=.*tradeType=/);

    const url = new URL(page.url());
    expect(url.searchParams.getAll("tradeType")).toEqual(
      expect.arrayContaining([
        "建築/内装｜木工",
        "設備/施工｜電気（その他全般）",
      ]),
    );

    // 鈴木工務店（recruit_job_types に 木工 + 電気 を保持）はヒット
    await expect(
      page.getByRole("heading", { name: /鈴木工務店/ }),
    ).toBeVisible();

    // 中村リフォーム（木工 を持つ → overlap）もヒット
    await expect(
      page.getByRole("heading", { name: /中村リフォーム/ }),
    ).toBeVisible();

    // 山田建設（鉄筋工/型枠工 のみで 木工/電気 を持たない）は非表示。
    // これが `.overlaps()` + `!inner` で親行 (users) が絞り込まれている証拠。
    await expect(
      page.getByRole("heading", { name: /山田建設/ }),
    ).toHaveCount(0);
  });
});

// =============================================================================
// 9.4d 廃止項目（deprecated_at）の表示と除外
// =============================================================================
// 注: seed.sql で master_qualifications.label='特級ボイラー技士' を deprecated_at に
// 倒し、contractor3（cc222222）が同 label を user_qualifications で保有している前提。
// テスト失敗時はまず `supabase db reset && pkill -f "next dev" && npm run dev` で
// dev プロセスごと立て直すこと（master fetch は unstable_cache でプロセスローカルに
// 1 時間保持されるため、reset 前から立っていた dev は古い master を返す）。
test.describe("9.4d 廃止項目（deprecated_at）の表示と除外", () => {
  test("編集画面: 既存保有 deprecated は「（廃止）」付き chip で表示され、検索候補からは除外される", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR3.email, TEST_CONTRACTOR3.password);

    await page.goto("/profile/edit");
    await expect(
      page.getByRole("heading", { name: "ユーザープロフィール編集" }),
    ).toBeVisible();

    // chip エリアに「特級ボイラー技士（廃止）」サフィックス付きで表示される
    await expect(
      page.getByText("特級ボイラー技士（廃止）", { exact: false }).first(),
    ).toBeVisible();

    // 保有資格 combobox を開いて検索しても候補に出ない（active リストから除外）
    const qualTrigger = page
      .getByText("保有資格", { exact: true })
      .locator(
        'xpath=following::button[@data-slot="master-combobox-trigger"][1]',
      );
    await qualTrigger.click();
    await page.locator('input[role="combobox"]').last().fill("特級ボイラー");
    await expect(
      page.getByRole("option", { name: "特級ボイラー技士", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", {
        name: "特級ボイラー技士（廃止）",
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("表示専用画面（CLI-006 受注者詳細）: deprecated label は素のまま表示し「（廃止）」を付けない", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);

    await page.goto(
      "/users/contractors/cc222222-2222-2222-2222-222222222222",
    );
    await expect(
      page.getByRole("heading", { name: "ユーザー詳細" }),
    ).toBeVisible();

    // 素の label 「特級ボイラー技士」が見える
    await expect(
      page.getByText("特級ボイラー技士", { exact: true }).first(),
    ).toBeVisible();

    // 「（廃止）」サフィックス付き表現は表示されない
    await expect(
      page.getByText("特級ボイラー技士（廃止）", { exact: false }),
    ).toHaveCount(0);
  });
});

// =============================================================================
// 9.4e Staff の応募ボタン非表示と /apply への redirect（多層防御確認）
// =============================================================================
test.describe("9.4e Staff の応募制限（多層防御）", () => {
  // master-skills 移行後も Staff が trade_types 配列を持つ案件に対して
  // UI 側で応募ボタンが非表示、Server Action（middleware redirect）でも
  // ブロックされることを確認する。
  const OPEN_JOB_ID = "88888888-8888-8888-8888-888888888898"; // 応募フォームテスト用案件

  test("Staff: CON-003 で trade_types を含む案件詳細を閲覧できるが「応募する」は非表示", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);

    await page.goto(`/jobs/${OPEN_JOB_ID}`);
    await expect(
      page.getByText("応募フォームテスト用案件"),
    ).toBeVisible();
    // 案件の trade_types は表示される（マスタ参照の表示は staff にも開放）
    await expect(
      page.getByText("建築/内装｜木工").first(),
    ).toBeVisible();

    // 応募導線は完全に隠れている
    await expect(
      page.getByRole("link", { name: "応募する" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "応募する" }),
    ).toHaveCount(0);
  });

  test("Staff: /jobs/[id]/apply を直叩きすると middleware でマイページに redirect される", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/jobs/${OPEN_JOB_ID}/apply`);
    await page.waitForURL(/\/mypage/);
    expect(page.url()).toMatch(/\/mypage/);
  });
});
