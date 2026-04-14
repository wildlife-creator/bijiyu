#!/usr/bin/env node
/**
 * CP1 verification via Playwright.
 *
 * Spawns a real Chromium context, logs in as seed users through the actual
 * /login flow, then makes raw HTTP requests via the browser context's request
 * API so we can read the headers / Set-Cookie that the middleware emits.
 *
 * Run after: `supabase start`, `supabase db reset`, `npm run dev`.
 */
import { chromium } from "@playwright/test";

const APP_URL = "http://localhost:3000";

async function loginAndGetContext(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/);
  await page.close();
  return context;
}

async function probe(context, path) {
  const res = await context.request.fetch(`${APP_URL}${path}`, {
    method: "GET",
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const headers = res.headers();
  const setCookie = headers["set-cookie"] ?? "";
  const setCookieArr = setCookie.split("\n").filter(Boolean);
  return {
    status: res.status(),
    "x-billing-status": headers["x-billing-status"] ?? "(none)",
    "x-past-due-since": headers["x-past-due-since"] ?? "(none)",
    feeCookieSet: setCookieArr.some((c) => c.startsWith("bijiyu_fee="))
      ? "YES"
      : "no",
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];

    const contractor = await loginAndGetContext(
      browser,
      "contractor@test.local",
      "testpass123",
    );
    const t1 = await probe(contractor, "/mypage");
    results.push({ test: "1) contractor + /mypage", ...t1 });
    const t3 = await probe(contractor, "/billing?fee=free");
    results.push({ test: "3) contractor + /billing?fee=free", ...t3 });
    await contractor.close();

    const client = await loginAndGetContext(
      browser,
      "client@test.local",
      "testpass123",
    );
    const t2 = await probe(client, "/mypage");
    results.push({ test: "2) client + /mypage", ...t2 });
    const t4 = await probe(client, "/billing?fee=free");
    results.push({ test: "4) client + /billing?fee=free", ...t4 });
    await client.close();

    console.table(results);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
