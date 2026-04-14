import { chromium } from "@playwright/test";

const APP_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Screenshot as contractor (free user) → CLI-026.png equivalent
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page1 = await ctx1.newPage();
  await page1.goto(`${APP_URL}/login`);
  await page1.getByLabel("メールアドレス").fill("contractor@test.local");
  await page1.getByLabel("パスワード").fill("testpass123");
  await page1.getByRole("button", { name: "ログイン" }).click();
  await page1.waitForURL(/\/mypage/);
  await page1.goto(`${APP_URL}/billing`);
  await page1.waitForLoadState("networkidle");
  await page1.screenshot({ path: "/tmp/billing-contractor.png", fullPage: true });
  console.log("saved /tmp/billing-contractor.png");
  await ctx1.close();

  // Screenshot as client (paid user) → CLI-026-b.png equivalent
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`${APP_URL}/login`);
  await page2.getByLabel("メールアドレス").fill("client@test.local");
  await page2.getByLabel("パスワード").fill("testpass123");
  await page2.getByRole("button", { name: "ログイン" }).click();
  await page2.waitForURL(/\/mypage/);
  await page2.goto(`${APP_URL}/billing`);
  await page2.waitForLoadState("networkidle");
  await page2.screenshot({ path: "/tmp/billing-client.png", fullPage: true });
  console.log("saved /tmp/billing-client.png");
  await ctx2.close();

  await browser.close();
}

main().catch(console.error);
