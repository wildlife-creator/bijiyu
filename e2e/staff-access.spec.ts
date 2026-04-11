import { test, expect } from "@playwright/test";
import {
  login,
  TEST_STAFF,
  TEST_STAFF_ADMIN,
  TEST_CLIENT,
  TEST_CONTRACTOR,
} from "./helpers";

// 他社（山田建設）の案件 — staff（鈴木工務店所属）にとって「他社の案件」
const OTHER_ORG_JOB_ID = "88888888-8888-8888-8888-888888888898";

// ============================================================
// 担当者（org_role = staff）の受注者アクション制限テスト
// ============================================================
test.describe("担当者（org_role=staff）の受注者アクション制限", () => {
  // -------------------------------------------------------
  // 正常系: 閲覧可能な画面
  // -------------------------------------------------------

  test("マイページ（CON-001）を表示できる", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await expect(
      page.getByRole("heading", { name: "マイページ" }),
    ).toBeVisible();
  });

  test("募集案件一覧（CON-002）を閲覧できる", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/jobs/search");
    await expect(
      page.getByRole("heading", { name: "募集案件一覧" }),
    ).toBeVisible();
  });

  test("募集案件詳細（CON-003）を閲覧でき、応募ボタンが表示されない", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/jobs/${OTHER_ORG_JOB_ID}`);
    // 案件詳細が表示されている
    await expect(page.getByText("応募フォームテスト用案件")).toBeVisible();
    // 応募ボタンが存在しない
    await expect(
      page.getByRole("link", { name: "応募する" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "応募する" }),
    ).not.toBeVisible();
  });

  test("発注者一覧（CON-005）を閲覧できる", async ({ page }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/users/contractors");
    // ページが表示される（リダイレクトされない）
    await expect(page).toHaveURL(/\/users\/contractors/);
  });

  // -------------------------------------------------------
  // 制限系: ブロックされるルート
  // -------------------------------------------------------

  test("応募フォーム（CON-004）にアクセスするとマイページにリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto(`/jobs/${OTHER_ORG_JOB_ID}/apply`);
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });

  test("応募履歴一覧（CON-011）にアクセスするとマイページにリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/applications/history");
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });

  test("応募履歴詳細にアクセスするとマイページにリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF.email, TEST_STAFF.password);
    await page.goto("/applications/history/some-id");
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });
});

// ============================================================
// 組織管理者（org_role = admin、users.role = staff）も同じ制限
// ============================================================
test.describe("組織管理者（org_role=admin）の受注者アクション制限", () => {
  test("募集案件詳細（CON-003）を閲覧でき、応募ボタンが表示されない", async ({
    page,
  }) => {
    await login(page, TEST_STAFF_ADMIN.email, TEST_STAFF_ADMIN.password);
    await page.goto(`/jobs/${OTHER_ORG_JOB_ID}`);
    await expect(page.getByText("応募フォームテスト用案件")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "応募する" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "応募する" }),
    ).not.toBeVisible();
  });

  test("応募フォーム（CON-004）にアクセスするとマイページにリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF_ADMIN.email, TEST_STAFF_ADMIN.password);
    await page.goto(`/jobs/${OTHER_ORG_JOB_ID}/apply`);
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });

  test("応募履歴（CON-011）にアクセスするとマイページにリダイレクトされる", async ({
    page,
  }) => {
    await login(page, TEST_STAFF_ADMIN.email, TEST_STAFF_ADMIN.password);
    await page.goto("/applications/history");
    await page.waitForURL(/\/mypage/);
    await expect(page).toHaveURL(/\/mypage/);
  });
});

// ============================================================
// 対比: 発注者（client）は応募ボタンが表示される
// ============================================================
test.describe("対比: 発注者（client）は応募可能", () => {
  test("発注者は他社の案件詳細で応募ボタンが表示される", async ({ page }) => {
    // client2の案件をclient（鈴木工務店 = 別組織）で閲覧
    await login(page, TEST_CLIENT.email, TEST_CLIENT.password);
    await page.goto(`/jobs/${OTHER_ORG_JOB_ID}`);
    await expect(page.getByText("応募フォームテスト用案件")).toBeVisible();
    // 発注者は応募ボタンが表示される（レスポンシブでSP/PC用の2つが存在するためfirstで取得）
    await expect(
      page.getByRole("link", { name: "応募する" }).first(),
    ).toBeVisible();
  });
});

// ============================================================
// 対比: 受注者（contractor）は応募履歴にアクセスできる
// ============================================================
test.describe("対比: 受注者（contractor）は応募履歴にアクセス可能", () => {
  test("受注者は応募履歴一覧にアクセスできる", async ({ page }) => {
    await login(page, TEST_CONTRACTOR.email, TEST_CONTRACTOR.password);
    await page.goto("/applications/history");
    await expect(page).toHaveURL(/\/applications\/history/);
    await expect(
      page.getByRole("heading", { name: "応募履歴" }),
    ).toBeVisible();
  });
});
