import { expect, test } from "@playwright/test";

import {
  login,
  TEST_CLIENT,
  TEST_CONTRACTOR,
  TEST_INDIVIDUAL_CLIENT,
  TEST_STAFF,
} from "./helpers";

/**
 * 空き日程機能（CON-014/015/016）E2E。
 *
 * - 受注者: マイページ → /schedule → 登録 → 更新 → 削除（クリック導線必須）
 * - Staff: 三層防御（マイページ非表示 + /schedule 直叩きリダイレクト）
 * - Owner: client ロールでも登録可能
 * - CLI-006: 直近の未来 3 件以内に制限
 */

const SEED_CONTRACTOR_ID = "11111111-1111-1111-1111-111111111111";

function isoDateAfterDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

test.describe("受注者の空き日程フルフロー（マイページ起点クリック導線）", () => {
  test("マイページ → 一覧 → 追加 → 一覧反映 → 更新 → 削除", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/mypage");

    // クリック導線: マイページ → 空き日程一覧
    await page.getByRole("link", { name: "空き日程一覧" }).click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(
      page.getByRole("heading", { name: "空き日程", exact: true }),
    ).toBeVisible();

    // 「空き日程を追加する」 CTA → /schedule/new
    await page.getByRole("link", { name: "空き日程を追加する" }).click();
    await expect(page).toHaveURL(/\/schedule\/new$/);
    await expect(
      page.getByRole("heading", { name: "空き日程登録" }),
    ).toBeVisible();

    // 入力 → 登録
    const start = isoDateAfterDays(180);
    const end = isoDateAfterDays(185);
    await page.getByLabel("開始日").fill(start);
    await page.getByLabel("終了日").fill(end);
    await page.getByRole("button", { name: "空き日程を登録する" }).click();

    // 一覧へリダイレクト + 反映確認
    await expect(page).toHaveURL(/\/schedule$/);
    const expectedRange = `${start.replace(/-/g, "/")}〜${end.replace(/-/g, "/")}`;
    await expect(page.getByText(expectedRange)).toBeVisible();

    // 行クリック → 編集
    await page.getByText(expectedRange).click();
    await expect(page).toHaveURL(/\/schedule\/.+\/edit$/);
    await expect(
      page.getByRole("heading", { name: "空き日程更新" }),
    ).toBeVisible();

    // 終了日を 1 日延長して更新
    const newEnd = isoDateAfterDays(186);
    await page.getByLabel("終了日").fill(newEnd);
    await page.getByRole("button", { name: "空き日程を更新する" }).click();
    await expect(page).toHaveURL(/\/schedule$/);
    const updatedRange = `${start.replace(/-/g, "/")}〜${newEnd.replace(/-/g, "/")}`;
    await expect(page.getByText(updatedRange)).toBeVisible();

    // 行クリック → 削除（AlertDialog 経由）
    await page.getByText(updatedRange).click();
    await expect(page).toHaveURL(/\/schedule\/.+\/edit$/);
    await page.getByRole("button", { name: "削除する" }).first().click();
    await page.getByRole("button", { name: "削除する" }).last().click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(page.getByText(updatedRange)).toHaveCount(0);
  });

  test("過去の開始日を入力すると登録できない（HTML min + Zod の二重防御）", async ({
    page,
  }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/schedule/new");

    const past = isoDateAfterDays(-1);
    const future = isoDateAfterDays(5);
    // ブラウザ依存の min バリデーションをすり抜けて Zod を踏ませるため
    // min 属性に違反する値を直接 setInputFiles ではなく fill で投入する
    await page.getByLabel("開始日").fill(past);
    await page.getByLabel("終了日").fill(future);
    await page.getByRole("button", { name: "空き日程を登録する" }).click();
    // 一覧画面へは遷移しない（バリデーションエラーで留まる）
    await expect(page).toHaveURL(/\/schedule\/new$/);
  });
});

test.describe("Staff 三層防御（schedule）", () => {
  test("Staff のマイページに「予定を確認する」セクションが表示されない", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/mypage");
    await expect(page.getByRole("heading", { name: "予定を確認する" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "空き日程一覧" })).toHaveCount(
      0,
    );
  });

  test("Staff が /schedule に直叩きアクセスすると /mypage にリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/schedule");
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });

  test("Staff が /schedule/new に直叩きアクセスすると /mypage にリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/schedule/new");
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });
});

test.describe("発注者（client / individual-client）も schedule 利用可", () => {
  test("法人 Owner が /schedule にアクセスして登録 CTA が見える", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto("/schedule");
    await expect(
      page.getByRole("heading", { name: "空き日程", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "空き日程を追加する" }),
    ).toBeVisible();
  });

  test("個人発注者が /schedule にアクセスできる", async ({ page }) => {
    await login(
      page,
      TEST_INDIVIDUAL_CLIENT.email,
      TEST_INDIVIDUAL_CLIENT.password,
    );
    await page.goto("/schedule");
    await expect(
      page.getByRole("heading", { name: "空き日程", exact: true }),
    ).toBeVisible();
  });
});

test.describe("CLI-006 表示制限（REQ-SC-004）", () => {
  test("発注者がコントラクター詳細を開くと、空き日程は最大 3 件で過去日程が含まれない", async ({
    page,
  }) => {
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/users/contractors/${SEED_CONTRACTOR_ID}`);
    await expect(
      page.getByRole("heading", { name: "ユーザー詳細" }),
    ).toBeVisible();

    // 空き日程セクションの行は最大 3 件
    const scheduleSection = page.getByRole("heading", { name: "空き日程" });
    if ((await scheduleSection.count()) > 0) {
      const rows = page.locator("section:has(h3:text('空き日程')) tbody tr");
      const count = await rows.count();
      expect(count).toBeLessThanOrEqual(3);

      // 表示されている各日程の終了日（〜の右側）が今日以降であること
      const todayIso = isoDateAfterDays(0);
      for (let i = 0; i < count; i++) {
        const text = (await rows.nth(i).innerText()).trim();
        const match = text.match(/〜(\d{4}\/\d{2}\/\d{2})/);
        if (match) {
          const end = match[1].replace(/\//g, "-");
          expect(end >= todayIso).toBe(true);
        }
      }
    }
  });
});
