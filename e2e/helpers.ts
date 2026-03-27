import { type Page } from "@playwright/test";

export const TEST_CONTRACTOR = {
  email: "contractor@test.local",
  password: "testpass123",
};

export const TEST_CLIENT = {
  email: "client@test.local",
  password: "testpass123",
};

export async function login(
  page: Page,
  email: string = TEST_CONTRACTOR.email,
  password: string = TEST_CONTRACTOR.password,
) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/);
}
