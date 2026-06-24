import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { login, TEST_PHASE8 } from "./helpers";

/**
 * proxy-account-multi-org-support Phase 8 / Task 8.1〜8.5
 *
 * N 組織兼任の全 E2E シナリオ網羅。各 test は seed 上で完全に分離された
 * 法人 Z1〜Z4 と専用 target user を使い、互いの mutate に依存しない。
 *
 * カバレッジ:
 *   - 8.1: 既存ユーザー再利用パスでの招待（Z2 owner が Z1 在籍ユーザーを代理招待）
 *   - 8.2: 削除のスコープ限定（Z1 owner が削除しても Z2 のデータは無傷）
 *   - 8.3: 解約のスコープ限定（Z3 解約 + 他組織在籍ユーザーの deleted_at 非セット）
 *   - 8.5: 氏名不一致 / 代理 + admin 禁止のエラーシナリオ
 *
 * 8.4（組織切替 UI）は `e2e/org-switcher.spec.ts`（Phase 7 / Task 7.4）で
 * 完全網羅済み。重複追加はしない。
 */

/**
 * dev 環境では Resend ではなく `/tmp/bijiyu-dev-mail/` に HTML が落ちる
 * （src/lib/email/send-email.ts の `devLocalEmailFallback`）。Mailpit は
 * Supabase Auth の inviteUserByEmail にしか使われないため、アプリ層から送る
 * proxy-assigned-existing-user メールは file system に書き出される。
 */
const DEV_MAIL_DIR = "/tmp/bijiyu-dev-mail";

async function findDevMailFor(
  email: string,
  subjectPatternHint?: RegExp,
): Promise<{ filename: string; html: string } | null> {
  // 宛先は filename に escape された形（@ や . はそのまま）で含まれるため、
  // 部分一致で検索する。複数候補があれば最新（mtime 降順）を採用。
  for (let i = 0; i < 20; i++) {
    try {
      const files = await readdir(DEV_MAIL_DIR);
      const safeMarker = email.replace(/[^a-zA-Z0-9.@_-]/g, "_");
      const candidates = files.filter((f) => f.includes(safeMarker));
      if (candidates.length > 0) {
        // 最新を後ろから走査（タイムスタンプ prefix で sort 済）
        for (const f of candidates.sort().reverse()) {
          const html = await readFile(join(DEV_MAIL_DIR, f), "utf8");
          if (!subjectPatternHint || subjectPatternHint.test(html)) {
            return { filename: f, html };
          }
        }
      }
    } catch {
      // ディレクトリが未作成の可能性。次の poll で再試行
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function submitInviteForm(
  page: Page,
  args: {
    lastName: string;
    firstName: string;
    email: string;
    isProxyAccount?: boolean;
  },
): Promise<void> {
  await page.goto("/mypage/members/new");
  await expect(
    page.getByRole("heading", { name: "担当者新規作成" }),
  ).toBeVisible();
  await page.getByPlaceholder("田中").fill(args.lastName);
  await page.getByPlaceholder("一郎").fill(args.firstName);
  await page.getByPlaceholder("test@example.com").fill(args.email);
  if (args.isProxyAccount) {
    await page.getByRole("checkbox", { name: "代理アカウント" }).check();
  }
  await page.getByRole("button", { name: "入力内容を確認する" }).click();
  await expect(page.getByText("名前").first()).toBeVisible();
  await page.getByRole("button", { name: "送信する" }).click();
}

// ===========================================================================
// 8.1: 招待 → N 法人追加 → 動作確認
// ===========================================================================
test.describe("Phase 8 / Task 8.1: 既存ユーザー再利用パス", () => {
  test("Z2 owner が Z1 在籍代理ユーザーを招待 → reuse path で Z2 にも追加 + 通知メール", async ({
    page,
  }) => {
    // Step 1: Z2 owner がログインして CLI-022 経由で代理招待を送信
    await login(page, TEST_PHASE8.z2Owner.email, TEST_PHASE8.password);
    await submitInviteForm(page, {
      lastName: TEST_PHASE8.reuseTarget.lastName,
      firstName: TEST_PHASE8.reuseTarget.firstName,
      email: TEST_PHASE8.reuseTarget.email,
      isProxyAccount: true,
    });

    // 招待成功で /mypage/members に戻る + 成功トースト
    await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 10000 });
    await expect(page.getByText(/招待しました/)).toBeVisible();

    // Step 2: 通知メール（proxy-assigned-existing-user）が dev fallback で
    // /tmp/bijiyu-dev-mail に書き出されることを検証
    const mail = await findDevMailFor(
      TEST_PHASE8.reuseTarget.email,
      /代理アカウントとして設定されました/,
    );
    expect(mail, "proxy-assigned-existing-user メールが書き出されること").not.toBeNull();
    expect(mail?.html).toContain(TEST_PHASE8.z2Owner.displayName);

    // Step 3: 招待された本人が両組織にアクセスできることを確認
    // ログアウトしてから target でログイン
    await page.context().clearCookies();
    await login(
      page,
      TEST_PHASE8.reuseTarget.email,
      TEST_PHASE8.password,
    );
    await page.waitForURL(/\/mypage/);

    // N=2 なので OrgSwitcher が DOM 出力される
    const switcher = page.getByRole("combobox", {
      name: "所属組織を切り替える",
    });
    await expect(switcher).toBeVisible();
    // 選択肢を開いて両組織が出ることを確認
    await switcher.click();
    await expect(
      page.getByRole("option", { name: TEST_PHASE8.z1Owner.displayName }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: TEST_PHASE8.z2Owner.displayName }),
    ).toBeVisible();
  });
});

// ===========================================================================
// 8.2: 削除 → 他組織で継続
// ===========================================================================
test.describe("Phase 8 / Task 8.2: 削除のスコープ限定", () => {
  test("Z3 owner が phase8-multi-keep を削除 → Z4 だけ残る + Z4 のスレッドは無傷", async ({
    page,
  }) => {
    // Step 1: Z3 owner で詳細画面に移動して削除実行
    await login(page, TEST_PHASE8.z3Owner.email, TEST_PHASE8.password);
    await page.goto(`/mypage/members/${TEST_PHASE8.multiKeep.userId}`);
    await expect(
      page.getByRole("heading", { name: "担当者詳細" }),
    ).toBeVisible();

    // window.confirm を自動承認
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "削除する" }).click();

    // 一覧に戻る + 成功トースト
    await page.waitForURL(/\/mypage\/members(\?|$)/, { timeout: 10000 });
    await expect(page.getByText("担当者を削除しました")).toBeVisible();

    // Step 2: target は引き続きログイン可能（deleted_at セットされていない）
    await page.context().clearCookies();
    await login(
      page,
      TEST_PHASE8.multiKeep.email,
      TEST_PHASE8.password,
    );
    await page.waitForURL(/\/mypage/);

    // Step 3: Z4 のメッセージスレッドが無傷で見える
    await page.goto("/messages");
    await expect(
      page.getByText("Phase8 Z4 スレッド: 削除後も残るメッセージです。"),
    ).toBeVisible();
  });
});

// ===========================================================================
// 8.3: 解約 → 他組織で継続
// ===========================================================================
test.describe("Phase 8 / Task 8.3: 解約のスコープ限定", () => {
  test("Z5 解約 → phase8-cancel-keep は Z6 で継続 + deleted_at セットされない", async ({
    page,
    request,
  }) => {
    // Step 1: Z5 の subscription を「解約」状態に遷移させる。
    // 本物の Stripe webhook を組み立てるのは大掛かりなので、handle_subscription_lifecycle_deleted
    // RPC を service role 経由で直接呼び出して同等の DB 遷移を起こす。
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(
      key,
      "SUPABASE_SERVICE_ROLE_KEY が dotenv 経由でロードされていること",
    ).toBeTruthy();

    const rpcRes = await request.post(
      "http://127.0.0.1:54321/rest/v1/rpc/handle_subscription_lifecycle_deleted",
      {
        headers: {
          apikey: key as string,
          Authorization: `Bearer ${key as string}`,
          "Content-Type": "application/json",
        },
        data: {
          event_data: {
            stripe_subscription_id: TEST_PHASE8.z5Owner.stripeSubscriptionId,
          },
        },
      },
    );
    expect(rpcRes.ok(), `RPC 呼び出しが成功すること（${rpcRes.status()}）`).toBeTruthy();

    // Step 2: phase8-cancel-keep がログイン可能 = users.deleted_at IS NULL
    await login(
      page,
      TEST_PHASE8.cancelKeep.email,
      TEST_PHASE8.password,
    );
    await page.waitForURL(/\/mypage/);

    // Step 3: 既に単一組織（Z6）になっているため OrgSwitcher は DOM 出力されない
    await expect(
      page.locator('[data-testid="org-switcher"]'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "所属組織を切り替える" }),
    ).toHaveCount(0);
  });
});

// ===========================================================================
// 8.5: 氏名不一致・代理 + admin 禁止のエラーシナリオ
// ===========================================================================
test.describe("Phase 8 / Task 8.5: エラーシナリオ", () => {
  test("既存ユーザー再利用パスで氏名を間違えると汎用エラー（既存氏名は応答に含まれない）", async ({
    page,
  }) => {
    await login(page, TEST_PHASE8.z2Owner.email, TEST_PHASE8.password);
    await submitInviteForm(page, {
      // 正しい氏名は「田中 太郎」だが、わざと違う氏名で送信
      lastName: "佐藤",
      firstName: "次郎",
      email: TEST_PHASE8.nameMismatch.email,
      isProxyAccount: true,
    });

    // 汎用エラー（「違うお名前で登録されています」）が表示される
    await expect(
      page.getByText(/違うお名前で登録されています/),
    ).toBeVisible();
    // 既存氏名（田中 太郎）が応答に含まれないこと（プライバシー保護）
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("田中");
    expect(bodyText).not.toContain("太郎");
  });

  test("CLI-022 招待フォームで代理チェック ON にすると admin オプションが消える（R6 リマインド）", async ({
    page,
  }) => {
    // 本ケースは e2e/members.spec.ts の R6 describe で完全網羅済み。
    // Phase 8 セットアップ（z2-owner / Z2）でも同じ挙動になることだけ確認する。
    await login(page, TEST_PHASE8.z2Owner.email, TEST_PHASE8.password);
    await page.goto("/mypage/members/new");
    await expect(
      page.getByRole("heading", { name: "担当者新規作成" }),
    ).toBeVisible();

    const roleSelect = page.locator("select#orgRole");
    const before = await roleSelect.locator("option").allInnerTexts();
    expect(before).toContain("管理者");

    await page.getByRole("checkbox", { name: "代理アカウント" }).check();

    const after = await roleSelect.locator("option").allInnerTexts();
    expect(after).not.toContain("管理者");
    expect(after).toContain("担当者");
  });
});
