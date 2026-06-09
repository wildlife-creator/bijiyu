import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

import { login, TEST_NEW_CONTRACTOR_E2E } from "./helpers";

/**
 * テストごとに new-contractor-e2e ユーザーの状態を「メール確認済 + プロフィール未設定」に戻す。
 * Playwright は JS なので docker exec 経由で psql を叩く。
 * (`supabase db reset` だと他テストにも影響するため使わない)
 */
function resetNewContractorE2eUser(): void {
  const sql = [
    "UPDATE public.users SET last_name = NULL, first_name = NULL, gender = NULL, birth_date = NULL, prefecture = NULL WHERE id = 'e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0';",
    "DELETE FROM user_skills WHERE user_id = 'e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0';",
    "DELETE FROM user_available_areas WHERE user_id = 'e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0';",
    "UPDATE auth.users SET encrypted_password = crypt('testpass123', gen_salt('bf')) WHERE email = 'new-contractor-e2e@test.local';",
  ].join(" ");
  execSync(
    `docker exec supabase_db_bijiyu psql -U postgres -d postgres -c "${sql}"`,
    { stdio: "ignore" },
  );
}

/**
 * AUTH-006 (プロフィール入力フォーム) 通し E2E
 * master-area-multi-select Phase F Task 6.1
 *
 * 範囲: ファイル名は `auth-signup` だが本 spec は AUTH-006 のプロフィール入力フォーム
 * 中心(AUTH-001〜005 のメール認証フローは対象外)。
 *
 * 前提 seed (supabase/seed.sql 該当箇所):
 *   - auth.users.new-contractor-e2e@test.local: email_confirmed_at = now() 設定済
 *   - public.users.new-contractor-e2e: last_name IS NULL (プロフィール未設定)
 *   - handle_new_user トリガー経由で role='contractor' で自動作成
 *
 * フロー:
 *   1. ログイン → middleware が last_name IS NULL を検出 → /register/profile へリダイレクト
 *   2. AUTH-006 フォームに 氏名 / 性別 / 生年月日 / お住まい / 対応職種 / 対応エリア (新 UI 複数県)
 *      / パスワード を入力
 *   3. 「入力内容を確認する」クリック → completeRegistrationAction 成功 → /register/complete 到達
 *
 * 注意: register-profile-form の submit は『入力内容を確認する』ラベル。
 * 成功時は router.push('/register/complete') (本 E2E では URL のみ確認、完了画面の内容は対象外)。
 */
test.describe("AUTH-006 プロフィール入力フォーム通し (master-area-multi-select Phase F)", () => {
  test.beforeEach(() => {
    // テスト前にユーザーの状態を初期 seed 状態(last_name=NULL等)に戻す。
    // 同一ユーザーへの再実行に強くする。
    resetNewContractorE2eUser();
  });

  test("メール確認済 + last_name=NULL のユーザーが /register/profile を入力して登録完了する", async ({
    page,
  }) => {
    // 1. ログイン
    await login(page, TEST_NEW_CONTRACTOR_E2E.email, TEST_NEW_CONTRACTOR_E2E.password);

    // 2. 何らかの認証済ページへアクセス → middleware が /register/profile へリダイレクト
    await page.goto("/mypage");
    await page.waitForURL(/\/register\/profile/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "新規会員登録" }),
    ).toBeVisible();

    // 3. 氏名
    await page.locator("#lastName").fill("テスト姓");
    await page.locator("#firstName").fill("テスト名");

    // 4. 性別 (shadcn Select。selectOption() は使えないので 2 段クリック)
    await page.getByLabel("性別").click();
    await page.getByRole("option", { name: "男性", exact: true }).click();

    // 5. 生年月日
    await page.locator("#birthDate").fill("1990-04-01");

    // 6. お住まい (ResidencePicker: 都道府県 + 市区町村。市区町村は任意なので
    //    ここでは都道府県のみ選択する)
    await page.getByLabel("お住まい").click();
    await page.getByRole("option", { name: "東京都", exact: true }).click();

    // 7. 対応できる職種 (MasterCombobox)
    await page.getByRole("button", { name: "職種を選択" }).first().click();
    await page.getByRole("combobox").last().fill("大工");
    await page.getByRole("option", { name: "建築/躯体｜大工", exact: true }).first().click();
    await page.keyboard.press("Escape");

    // 8. 対応可能エリア — 新 UI で複数県マルチ選択 (Req 13-4 の範囲を満たす)
    //    1 県目: 東京都全域
    await page.getByRole("button", { name: "+ 県を追加" }).click();
    await page
      .locator('[data-slot="select-trigger"]:has-text("都道府県を選択")')
      .first()
      .click();
    await page.getByRole("option", { name: "東京都", exact: true }).click();
    await page.getByLabel("全域").first().check();

    //    2 県目: 神奈川県 + 横浜市鶴見区
    await page.getByRole("button", { name: "+ 県を追加" }).click();
    await page
      .locator('[data-slot="select-trigger"]:has-text("都道府県を選択")')
      .first()
      .click();
    await page.getByRole("option", { name: "神奈川県", exact: true }).click();
    await page.getByLabel("横浜市鶴見区", { exact: true }).check();

    // 9. パスワード (seed の暫定 password と異なる値にする。同一値だと
    //    Supabase Auth の updateUser が "same password" として拒否することがある)
    await page.locator("#password").fill("newpass456");
    await page.locator("#confirmPassword").fill("newpass456");

    // 10. 「入力内容を確認する」クリック →
    //     completeRegistrationAction 成功 → /register/complete →
    //     RegistrationCompleteRedirect が 3 秒で /mypage へ自動 navigate。
    //     最終到達先 /mypage で検証する (tasks.md 6.1 要件 "登録するクリック → /mypage 到達確認")。
    await page.getByRole("button", { name: "入力内容を確認する" }).click();
    await page.waitForURL(/\/mypage/, { timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "マイページ", exact: true }),
    ).toBeVisible();
  });
});
