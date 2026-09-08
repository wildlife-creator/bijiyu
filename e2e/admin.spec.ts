import { test, expect, type Page } from "@playwright/test";

import { TEST_ADMIN, TEST_CONTRACTOR, TEST_CLIENT, TEST_STAFF, login } from "./helpers";

/**
 * admin spec Task 14: 管理者機能の E2E。
 *
 * - 14.1 導線スモーク: ADM-001 ログイン → ダッシュボード → 全10メニューをクリック到達 →
 *   ログアウト → /admin/login。非 admin / 未認証のブロック検証
 * - 14.2 ドメイン別: 本人確認審査・応募履歴 8分類と発注取消・管理責任者 招待フロー・
 *   発注者管理ドリルダウン・代理メッセージ閲覧
 *
 * 前提 seed（admin spec Task 13）:
 * - pending 本人確認 = 山本健（古い）/ pending CCUS = 井上翔（新しい）
 * - 発注取消対象 = ada00000-0000-4000-8000-000000000004（accepted＋稼働日前・使い捨て）
 * - 代理スレッド = 鈴木工務店 × 山本健（is_proxy 2通）
 * - 8分類すべてを網羅する応募データ
 */

const MAILPIT_API = "http://127.0.0.1:54324/api/v1";

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(TEST_ADMIN.email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/admin\/dashboard/);
}

/** ヘッダー右上のハンバーガーメニューを開いてログアウトする。 */
async function adminLogout(page: Page) {
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForURL(/\/admin\/login/);
}

// ============================================================
// 14.1 admin 導線スモーク
// ============================================================

test.describe("ADM-001/002: admin 導線スモーク", () => {
  test("ログイン → 全10メニューをクリックで到達 → ログアウト → /admin/login に戻る", async ({
    page,
  }) => {
    await adminLogin(page);

    // ダッシュボードの9メニュー＋パスワード再設定（計10メニュー）をクリックで巡回。
    // 各画面から共通ヘッダーのロゴ（accessible name「ビジ友 管理画面」）でダッシュボードへ戻る
    const menus: Array<[string, RegExp, string]> = [
      ["発注者アカウント一覧", /\/admin\/clients/, "発注者 アカウント一覧"],
      ["ユーザーアカウント一覧", /\/admin\/users/, "ユーザーアカウント一覧"],
      ["本人確認承認申請一覧", /\/admin\/verifications/, "本人確認承認申請一覧"],
      ["応募履歴一覧", /\/admin\/applications/, "応募履歴一覧"],
      ["お問い合わせ一覧", /\/admin\/contacts/, "お問い合わせ一覧"],
      ["トラブル報告一覧", /\/admin\/trouble-reports/, "トラブル報告一覧"],
      ["求人問い合わせ一覧", /\/admin\/job-inquiries/, "求人問い合わせ一覧"],
      ["代理メッセージ一覧", /\/admin\/messages/, "代理メッセージ一覧"],
      ["銀行振込申込一覧", /\/admin\/bank-transfers/, "銀行振込申込一覧"],
      ["パスワード再設定", /\/admin\/password/, "パスワード再設定"],
    ];

    for (const [label, urlPattern, heading] of menus) {
      await page.getByRole("link", { name: label }).click();
      await page.waitForURL(urlPattern);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "ビジ友 管理画面" }).click();
      await page.waitForURL(/\/admin\/dashboard/);
    }

    // ヘッダー右上のハンバーガーメニューからログアウト → /admin/login へ戻る
    await adminLogout(page);

    // セッションが無効化されている（/admin/* へ直行しても login へ戻される）
    await page.goto("/admin/dashboard");
    await page.waitForURL(/\/admin\/login/);
  });

  test("未認証の /admin/*（login 以外）は /admin/login へリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/admin/clients");
    await page.waitForURL(/\/admin\/login/);
    await expect(
      page.getByRole("heading", { name: "管理者ログイン" }),
    ).toBeVisible();
  });

  test("contractor は /admin/* に到達できない", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/admin/dashboard");
    await page.waitForURL(/\/mypage/);
    await page.goto("/admin/clients");
    await page.waitForURL(/\/mypage/);
  });

  test("client は /admin/* に到達できない", async ({ page }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/admin/dashboard");
    await page.waitForURL(/\/mypage/);
  });

  test("staff は /admin/* に到達できない", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/admin/dashboard");
    await page.waitForURL(/\/mypage/);
  });
});

// ============================================================
// 14.2 本人確認審査（ADM-011/012）
// ============================================================

test.describe("ADM-011/012: 本人確認審査", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("申請一覧が古い順・種別ラベル付きで表示される", async ({ page }) => {
    await page.goto("/admin/verifications");
    await expect(
      page.getByRole("heading", { name: "本人確認承認申請一覧" }),
    ).toBeVisible();

    const rows = page.locator("a[href^='/admin/verifications/']");
    // 古い順: 山本健（identity・2日前）→ 井上翔（CCUS・1日前）
    await expect(rows.nth(0)).toContainText("山本健");
    await expect(rows.nth(0)).toContainText("本人確認");
    await expect(rows.nth(1)).toContainText("井上翔");
    await expect(rows.nth(1)).toContainText("CCUS");
  });

  test("否認理由なしでは否認ボタンが非活性・理由入力で活性化する", async ({
    page,
  }) => {
    await page.goto("/admin/verifications");
    await page.locator("a[href^='/admin/verifications/']").first().click();
    await expect(
      page.getByRole("heading", { name: "本人確認承認可否" }),
    ).toBeVisible();

    // identity 審査中は本人確認/CCUS の両セクションにボタンがあるためスコープする
    const identitySection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "本人確認", exact: true }) });
    const ccusSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "CCUS登録" }) });

    // 審査対象（本人確認）: 承認は常時活性・否認は否認理由入力時のみ
    await expect(
      identitySection.getByRole("button", { name: "承認" }),
    ).toBeEnabled();
    await expect(
      identitySection.getByRole("button", { name: "否認" }),
    ).toBeDisabled();

    // 非対象（CCUS）: 「未申請」グレーアウトでボタン非活性
    await expect(ccusSection.getByText("未申請")).toBeVisible();
    await expect(
      ccusSection.getByRole("button", { name: "承認" }),
    ).toBeDisabled();

    await identitySection
      .getByLabel("否認理由")
      .fill("書類が不鮮明なため再提出をお願いします");
    await expect(
      identitySection.getByRole("button", { name: "否認" }),
    ).toBeEnabled();
  });

  test("承認すると申請が一覧から消える", async ({ page }) => {
    await page.goto("/admin/verifications");
    // 山本健（identity pending・使い捨て seed）の詳細を開いて承認
    await page
      .locator("a[href^='/admin/verifications/']")
      .filter({ hasText: "山本健" })
      .click();
    await page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "本人確認", exact: true }) })
      .getByRole("button", { name: "承認" })
      .click();

    // 承認後は ADM-011 へ戻り、一覧から消えている
    await page.waitForURL(/\/admin\/verifications$/);
    await expect(
      page
        .locator("a[href^='/admin/verifications/']")
        .filter({ hasText: "山本健" }),
    ).toHaveCount(0);
    // 井上翔（CCUS pending）は残っている
    await expect(
      page
        .locator("a[href^='/admin/verifications/']")
        .filter({ hasText: "井上翔" }),
    ).toHaveCount(1);
  });
});

// ============================================================
// 14.2 応募履歴（ADM-013/014）: 8分類フィルタと発注取消
// ============================================================

test.describe("ADM-013/014: 応募履歴の8分類と発注取消", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("8分類フィルタそれぞれで絞り込め、行バッジが分類と一致する", async ({
    page,
  }) => {
    const categories = [
      "応募中",
      "発注済み・初回稼働日前",
      "評価未入力",
      "取引完了",
      "取引不成立",
      "ユーザー側からのキャンセル",
      "運営によるキャンセル",
      "発注側からのお断り",
    ];

    for (const label of categories) {
      await page.goto("/admin/applications");
      // shadcn Select は 2 段クリック（1つ目の combobox = ステータス）
      await page.locator("button[role='combobox']").first().click();
      await page.getByRole("option", { name: label, exact: true }).click();
      await page.getByRole("button", { name: "検索" }).click();
      await page.waitForURL(/category=/);

      // 件数整合: 1件以上ヒットし、行バッジが選択した分類と一致する
      await expect(page.getByText(/検索結果：[1-9]\d*件/)).toBeVisible();
      await expect(
        page.locator("a[href^='/admin/applications/']").first(),
      ).toContainText(label);
    }
  });

  test("発注取消: accepted＋稼働日前の応募が「運営によるキャンセル」に変わる", async ({
    page,
  }) => {
    // 使い捨て seed: ada00000-...-004（井上翔 → 山田建設・accepted・稼働日前）
    await page.goto(
      "/admin/applications/ada00000-0000-4000-8000-000000000004",
    );
    await expect(
      page.getByRole("heading", { name: "応募履歴詳細" }),
    ).toBeVisible();
    await expect(page.getByText("発注済み・初回稼働日前")).toBeVisible();

    await page.getByRole("button", { name: "発注を取り消す" }).click();
    await expect(page.getByText("発注を取り消しますか？")).toBeVisible();
    await page.getByRole("button", { name: "取り消す", exact: true }).click();

    // バッジが「運営によるキャンセル」に変わり、取消ボタンは消える
    await expect(page.getByText("運営によるキャンセル")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "発注を取り消す" }),
    ).toHaveCount(0);
  });
});

// ============================================================
// 14.2 管理責任者 招待フロー（ADM-006/007）
// ============================================================

test.describe("ADM-006/007: 管理責任者 招待フロー", () => {
  test("作成 → 招待メール → パスワード設定 → /billing（CLI-026）に着地する", async ({
    page,
  }) => {
    const inviteEmail = `adm-invite-${Date.now()}@test.local`;

    await adminLogin(page);
    await page.goto("/admin/clients");
    await page.getByRole("link", { name: "管理責任者 新規登録" }).click();
    await page.waitForURL(/\/admin\/clients\/new/);

    // ADM-006: 入力
    await page.getByLabel(/発注者名/).fill("招待テスト建設株式会社");
    await page.getByLabel("姓", { exact: true }).fill("招待");
    await page.getByLabel("名", { exact: true }).fill("花子");
    await page.getByLabel(/メールアドレス/).fill(inviteEmail);
    await page.getByRole("button", { name: "入力内容を確認する" }).click();

    // ADM-007: 確認 → 作成
    await expect(page.getByText("入力内容の確認")).toBeVisible();
    await expect(page.getByText("招待テスト建設株式会社")).toBeVisible();
    await expect(page.getByText(inviteEmail)).toBeVisible();
    await page.getByRole("button", { name: "招待メールを送信する" }).click();
    await page.waitForURL(/\/admin\/clients$/);

    // 招待メールを Mailpit（supabase local の dev メールボックス）から取得
    let verifyUrl: string | null = null;
    for (let i = 0; i < 20 && !verifyUrl; i++) {
      const res = await page.request.get(`${MAILPIT_API}/messages?limit=50`);
      const data = (await res.json()) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const msg = data.messages.find((m) =>
        m.To.some((t) => t.Address === inviteEmail),
      );
      if (msg) {
        const detailRes = await page.request.get(
          `${MAILPIT_API}/message/${msg.ID}`,
        );
        const detail = (await detailRes.json()) as {
          HTML: string;
          Text: string;
        };
        const body = `${detail.HTML}\n${detail.Text}`;
        const match = body.match(
          /https?:\/\/[^"'\s<>]*\/auth\/v1\/verify[^"'\s<>]*/,
        );
        if (match) verifyUrl = match[0].replace(/&amp;/g, "&");
      }
      if (!verifyUrl) await page.waitForTimeout(500);
    }
    expect(verifyUrl, "招待メールの verify リンクが取得できること").toBeTruthy();

    // 招待リンクは「招待された本人のブラウザ」で開く（実運用と同じ）。
    // admin セッションのまま踏むと middleware（admin は /admin/* 専用）が
    // /admin/dashboard へ跳ね返してトークンだけが消費されるため、先にログアウトする
    await adminLogout(page);

    // 招待リンクを踏む → implicit flow で /accept-invite/confirm に着地
    await page.goto(verifyUrl as string);
    await expect(
      page.getByText("ご利用開始にあたり、パスワードをご設定ください"),
    ).toBeVisible({ timeout: 15000 });

    await page.getByLabel("パスワード", { exact: true }).fill("invitepass123");
    await page.getByLabel("パスワード（確認）").fill("invitepass123");
    await page.getByRole("button", { name: "パスワードを設定する" }).click();

    // invited_company_name 持ちの招待は受注者オンボをスキップして CLI-026（/billing）へ。
    // /billing は「申し込む」ボタン（Stripe Checkout）があり、ここから発注者化できる。
    // 末尾の /plans を誤検出しないよう $ で /billing で終わる URL に限定する。
    await page.waitForURL(/\/billing(\?.*)?$/, { timeout: 15000 });
  });
});

// ============================================================
// 14.2 発注者管理ドリルダウン（ADM-003 → 004 → 022 → 013 → 014）
// ============================================================

test.describe("ADM-003/004/022: 発注者管理ドリルダウン", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("区分フィルタ（小規模発注者）で対象だけに絞り込まれる", async ({
    page,
  }) => {
    await page.goto("/admin/clients");
    // 1つ目の combobox = 区分
    await page.locator("button[role='combobox']").first().click();
    await page.getByRole("option", { name: "小規模発注者" }).click();
    await page.getByRole("button", { name: "検索" }).click();
    await page.waitForURL(/category=small/);

    await expect(page.getByText("木村洋一")).toBeVisible();
    await expect(page.getByText("鈴木花子")).toHaveCount(0);
  });

  test("ADM-003 区分フィルタ → ADM-004 → 募集現場 → ADM-022 → 応募一覧（絞込）→ ADM-014", async ({
    page,
  }) => {
    // ADM-003: 区分 = 管理責任者
    await page.goto("/admin/clients");
    await page.locator("button[role='combobox']").first().click();
    await page.getByRole("option", { name: "管理責任者" }).click();
    await page.getByRole("button", { name: "検索" }).click();
    await page.waitForURL(/category=owner/);

    // 鈴木花子（鈴木工務店 Owner）の行 → ADM-004
    await page
      .locator("a[href^='/admin/clients/']")
      .filter({ hasText: "鈴木花子" })
      .click();
    await expect(
      page.getByRole("heading", { name: "発注者 アカウント詳細" }),
    ).toBeVisible();

    // 募集現場一覧 → ADM-022
    await expect(page.getByText("募集現場一覧")).toBeVisible();
    // 募集現場一覧は先頭5件で折りたたまれる。seed 案件は created_at が同一で
    // 並び順が非決定的なため、目的の案件が畳まれている場合に備えて先に展開する。
    const showMore = page.getByRole("button", { name: /もっと見る/ });
    if (await showMore.isVisible().catch(() => false)) {
      await showMore.click();
    }
    await page
      .locator("a[href^='/admin/jobs/']")
      .filter({ hasText: "木造住宅の内装リフォーム工事" })
      .click();
    await expect(
      page.getByRole("heading", { name: "募集現場詳細" }),
    ).toBeVisible();
    await expect(page.getByText("木造住宅の内装リフォーム工事")).toBeVisible();

    // 応募一覧（現場で絞込済み）→ ADM-013
    await page.getByRole("link", { name: "応募一覧" }).click();
    await page.waitForURL(/\/admin\/applications\?jobId=/);
    await expect(
      page.getByText(/木造住宅の内装リフォーム工事.*で絞り込み中/),
    ).toBeVisible();
    await expect(page.getByText(/検索結果：[1-9]\d*件/)).toBeVisible();

    // 行クリック → ADM-014
    await page.locator("a[href^='/admin/applications/']").first().click();
    await expect(
      page.getByRole("heading", { name: "応募履歴詳細" }),
    ).toBeVisible();
  });
});

// ============================================================
// 14.2 代理メッセージ閲覧（ADM-023/024）
// ============================================================

test.describe("ADM-023/024: 代理メッセージ閲覧", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("ADM-004 の「代理メッセージを見る」から会社絞込で開く", async ({
    page,
  }) => {
    // 鈴木工務店（法人・代理スレッドあり）の ADM-004
    await page.goto("/admin/clients/22222222-2222-2222-2222-222222222222");
    await page.getByRole("link", { name: "代理メッセージを見る" }).click();
    await page.waitForURL(/\/admin\/messages\?organizationId=/);

    // 絞込済みで開く（フィルタに会社名が選択され、当該会社のスレッドのみ）
    await expect(
      page.locator("button[role='combobox']"),
    ).toContainText("鈴木工務店株式会社");
    await expect(page.getByText(/検索結果：[1-9]\d*件/)).toBeVisible();
    await expect(
      page.locator("a[href^='/admin/messages/']").first(),
    ).toContainText("山本健");
  });

  test("全社一覧から詳細を開く（代理バッジ表示・送信入力欄なし）", async ({
    page,
  }) => {
    await page.goto("/admin/messages");
    await expect(
      page.getByRole("heading", { name: "代理メッセージ一覧" }),
    ).toBeVisible();

    // proxy-multi-org seed（f777/f888 系）が last_message_at=now() で複数スレッドを
    // 追加したため `.first()` は 1 proxy message のスレッドを拾ってしまう。
    // 2 proxy messages を持つ adee0000 を contractor 名「山本健」で一意に特定する。
    await page.getByRole("link", { name: /山本健/ }).click();
    await expect(
      page.getByRole("heading", { name: "メッセージ詳細" }),
    ).toBeVisible();

    // 代理バッジ（seed の is_proxy=true メッセージ2通）
    await expect(
      page.locator("span").filter({ hasText: /^代理$/ }),
    ).toHaveCount(2);
    // 閲覧専用: 送信入力欄を持たない
    await expect(page.getByText("閲覧専用（送信はできません）")).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator("input[type='text']")).toHaveCount(0);
  });
});

// ============================================================
// ステージング指摘（2026-09）: 管理画面の「もどる」導線と検索欄のブラウザ戻り
// ============================================================

test.describe("ステージング指摘 No.35 / No.37 / No.40: admin の戻り導線", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("No.35: ADM-004 →「応募◯件」→ 検索 → もどる で ADM-004 に戻る（backTo を検索で落とさない）", async ({
    page,
  }) => {
    // 鈴木花子（鈴木工務店 Owner）の ADM-004
    await page.goto("/admin/clients/22222222-2222-2222-2222-222222222222");
    await expect(
      page.getByRole("heading", { name: "発注者 アカウント詳細" }),
    ).toBeVisible();

    // 募集現場一覧の「応募◯件」→ 応募一覧（現場で絞込 + backTo 付き）
    const showMore = page.getByRole("button", { name: /もっと見る/ });
    if (await showMore.isVisible().catch(() => false)) {
      await showMore.click();
    }
    await page.getByRole("link", { name: /^応募 \d+件$/ }).first().click();
    await page.waitForURL(/\/admin\/applications\?jobId=.*backTo=/);

    // 検索ボタンで URL を組み直しても backTo が維持される
    await page.getByRole("button", { name: "検索" }).click();
    await page.waitForURL(/\/admin\/applications\?.*backTo=/);
    await expect(page).toHaveURL(/jobId=/);

    // もどる → ダッシュボードではなく来た ADM-004 に戻る
    await page.getByRole("link", { name: "もどる" }).click();
    await page.waitForURL(/\/admin\/clients\/22222222-2222-2222-2222-222222222222/);
    await expect(
      page.getByRole("heading", { name: "発注者 アカウント詳細" }),
    ).toBeVisible();
  });

  test("No.37/38: ADM-009 →「発注者詳細」→ もどる で ADM-009 に戻る（backTo を引き継ぐ）", async ({
    page,
  }) => {
    // client ロールのユーザー詳細（鈴木花子）には「発注者詳細」ボタンが出る
    await page.goto("/admin/users/22222222-2222-2222-2222-222222222222");
    await expect(
      page.getByRole("heading", { name: "ユーザーアカウント詳細" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "発注者詳細" }).click();
    await page.waitForURL(/\/admin\/clients\/22222222-2222-2222-2222-222222222222\?backTo=/);
    await expect(
      page.getByRole("heading", { name: "発注者 アカウント詳細" }),
    ).toBeVisible();

    // もどる → 発注者一覧ではなく来た ADM-009 に戻る
    await page.getByRole("link", { name: "もどる" }).click();
    await page.waitForURL(/\/admin\/users\/22222222-2222-2222-2222-222222222222/);
    await expect(
      page.getByRole("heading", { name: "ユーザーアカウント詳細" }),
    ).toBeVisible();
  });

  test("No.40: 検索後にブラウザの戻る/進むを押すと検索欄の表示が URL に追従する（ADM-003）", async ({
    page,
  }) => {
    await page.goto("/admin/clients");
    const keyword = page.getByLabel("キーワード");
    await expect(keyword).toHaveValue("");

    await keyword.fill("鈴木");
    await page.getByRole("button", { name: "検索" }).click();
    await page.waitForURL(/q=/);
    await expect(keyword).toHaveValue("鈴木");

    // ブラウザ戻る → URL が検索前に戻り、入力欄も空に戻る
    await page.goBack();
    await page.waitForURL((url) => !url.searchParams.has("q"));
    await expect(keyword).toHaveValue("");

    // ブラウザ進む → 検索後の値に戻る
    await page.goForward();
    await page.waitForURL(/q=/);
    await expect(keyword).toHaveValue("鈴木");
  });

  test("No.40: キーワード 1 枠の共通フォーム（ADM-017 お問い合わせ一覧）でも同様に追従する", async ({
    page,
  }) => {
    await page.goto("/admin/contacts");
    const keyword = page.getByLabel("キーワード");
    await expect(keyword).toHaveValue("");

    await keyword.fill("テスト");
    await page.getByRole("button", { name: "検索" }).click();
    await page.waitForURL(/q=/);
    await expect(keyword).toHaveValue("テスト");

    await page.goBack();
    await page.waitForURL((url) => !url.searchParams.has("q"));
    await expect(keyword).toHaveValue("");
  });
});

// ============================================================
// ステージング指摘 No.8（2026-09）: 期限切れの発注済み応募を運営が解消できる（ADM-014）
// ============================================================

test.describe("ステージング指摘 No.8: ADM-014 期限切れ accepted の完了扱い", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("稼働終了日+5日を過ぎた accepted に「完了扱いにする」「発注を取り消す」が出て、完了扱いにすると「取引完了」になる", async ({
    page,
  }) => {
    // 使い捨て seed 6b: ada00000-...-0005（井上翔 → 外構工事・稼働終了 10 日前・評価なし）
    await page.goto("/admin/applications/ada00000-0000-4000-8000-000000000005");
    await expect(
      page.getByRole("heading", { name: "応募履歴詳細" }),
    ).toBeVisible();
    // 8 分類上は「評価未入力」だが、当事者はもう入力できない期限切れ
    await expect(page.getByText("評価未入力", { exact: true })).toBeVisible();
    await expect(page.getByText(/入力期間（稼働終了日から5日後まで）を過ぎている/)).toBeVisible();
    await expect(page.getByRole("button", { name: "完了扱いにする" })).toBeVisible();
    await expect(page.getByRole("button", { name: "発注を取り消す" })).toBeVisible();

    await page.getByRole("button", { name: "完了扱いにする" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("この応募を完了扱いにしますか？")).toBeVisible();
    await dialog.getByRole("button", { name: "完了扱いにする" }).click();

    // バッジが「取引完了」に変わり、解消ボタンは消える
    await expect(page.getByText("取引完了", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "完了扱いにする" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "発注を取り消す" })).toHaveCount(0);
  });

  test("期限内の accepted（稼働日前）には「完了扱いにする」は出ない（従来の発注取消のみ）", async ({
    page,
  }) => {
    // ada00000-...-0004 は accepted＋稼働日前（前段の発注取消テストで cancelled になる可能性が
    // あるため、表示確認は「完了扱いボタンが無い」ことだけに絞る）
    await page.goto("/admin/applications/ada00000-0000-4000-8000-000000000004");
    await expect(
      page.getByRole("heading", { name: "応募履歴詳細" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "完了扱いにする" })).toHaveCount(0);
  });
});
