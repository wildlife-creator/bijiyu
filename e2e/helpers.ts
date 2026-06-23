import { type Page } from "@playwright/test";

export const TEST_CONTRACTOR = {
  email: "contractor@test.local",
  password: "testpass123",
};

export const TEST_CONTRACTOR2 = {
  email: "contractor2@test.local",
  password: "testpass123",
};

export const TEST_CONTRACTOR3 = {
  email: "contractor3@test.local",
  password: "testpass123",
};

export const TEST_CONTRACTOR4 = {
  email: "contractor4@test.local",
  password: "testpass123",
};

export const TEST_CLIENT = {
  email: "client@test.local",
  password: "testpass123",
};

export const TEST_CLIENT2 = {
  email: "client2@test.local",
  password: "testpass123",
};

export const TEST_INDIVIDUAL_CLIENT = {
  email: "individual-client@test.local",
  password: "testpass123",
};

// master-area-multi-select Phase F: メール確認済 + プロフィール未設定の AUTH-006 通し E2E 用
export const TEST_NEW_CONTRACTOR_E2E = {
  email: "new-contractor-e2e@test.local",
  password: "testpass123",
};

export const TEST_STAFF = {
  email: "staff@test.local",
  password: "testpass123",
};

export const TEST_ADMIN = {
  email: "admin@test.local",
  password: "testpass123",
};

export const TEST_STAFF_ADMIN = {
  email: "staff-admin@test.local",
  password: "testpass123",
};

// proxy-account-multi-org-support Phase 3 / Task 3.2:
// N 法人兼任の代理スタッフ。法人 X / Y の両方に代理として在籍。
// Cookie 不在時の既定組織は法人 X（created_at で最古）。
export const TEST_PROXY_MULTI = {
  email: "proxy-multi@test.local",
  password: "testpass123",
  userId: "f777aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orgX: {
    id: "f777a111-1111-1111-1111-111111111111",
    displayName: "プロキシ法人 X 株式会社",
  },
  orgY: {
    id: "f777b222-2222-2222-2222-222222222222",
    displayName: "プロキシ法人 Y 株式会社",
  },
} as const;

export async function login(
  page: Page,
  email: string = TEST_CONTRACTOR.email,
  password: string = TEST_CONTRACTOR.password,
) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/);
}
