#!/usr/bin/env node
/**
 * CP3 verification: drive a full Stripe Checkout flow end-to-end via
 * Playwright headless Chromium and verify that the webhook handler updated
 * the local Supabase DB correctly.
 *
 * Pre-reqs:
 *   1. supabase start
 *   2. supabase db reset
 *   3. stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   4. npm run dev
 *
 * Steps:
 *   1. Login as `contractor@test.local` (free user)
 *   2. Visit /billing → click "個人発注者様向けプラン (¥3,800/月)"
 *   3. Wait for redirect to checkout.stripe.com
 *   4. Fill the test card 4242 4242 4242 4242, future date, any CVC, name
 *   5. Submit
 *   6. Wait for redirect back to /mypage?checkout=success
 *   7. Query Supabase via REST (service_role) to confirm:
 *        - users.role === 'client'
 *        - subscriptions row exists with plan_type='individual', status='active'
 *        - stripe_webhook_events row with status='completed'
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { setTimeout as wait } from "node:timers/promises";

const APP_URL = "http://localhost:3000";
const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

const TEST_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "contractor@test.local",
  password: "testpass123",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function fetchDbState() {
  const { data: user } = await admin
    .from("users")
    .select("id, email, role, stripe_customer_id")
    .eq("id", TEST_USER.id)
    .single();
  const { data: subs } = await admin
    .from("subscriptions")
    .select("id, plan_type, status, stripe_subscription_id, created_at")
    .eq("user_id", TEST_USER.id)
    .order("created_at", { ascending: false });
  const { data: events } = await admin
    .from("stripe_webhook_events")
    .select("id, stripe_event_id, event_type, status, error_message, processed_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return { user, subs: subs ?? [], events: events ?? [] };
}

async function main() {
  console.log("--- pre-flight DB state ---");
  const before = await fetchDbState();
  console.log(JSON.stringify(before, null, 2));

  if (before.user.role !== "contractor") {
    throw new Error(
      `expected initial role 'contractor' but got '${before.user.role}' — did you forget supabase db reset?`,
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[browser ${msg.type()}]`, msg.text());
    }
  });

  // 1. Login
  console.log("\n--- login as contractor ---");
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("メールアドレス").fill(TEST_USER.email);
  await page.getByLabel("パスワード").fill(TEST_USER.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/mypage/);
  console.log("login OK");

  // 2. Go to /billing and click individual plan
  console.log("\n--- /billing → click 個人発注者様向けプラン ---");
  await page.goto(`${APP_URL}/billing`);
  await page.waitForSelector('[data-testid="buy-plan-individual"]');
  await page.click('[data-testid="buy-plan-individual"]');

  // 3. Wait for checkout.stripe.com
  console.log("\n--- waiting for redirect to checkout.stripe.com ---");
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  console.log("on Stripe Checkout");

  // 4. Fill in test card
  // Stripe Checkout fields: cardNumber, cardExpiry, cardCvc, billingName
  console.log("\n--- filling test card 4242 4242 4242 4242 ---");
  // Wait for the card number input to be ready (more reliable than networkidle)
  await page.waitForSelector('input[name="cardNumber"]', { timeout: 30_000 });

  // Locator strategies — Stripe Checkout uses `name` attributes consistently
  await page.locator('input[name="email"]').fill("contractor@test.local").catch(() => {});
  await page.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
  await page.locator('input[name="cardExpiry"]').fill("12 / 30");
  await page.locator('input[name="cardCvc"]').fill("123");
  await page
    .locator('input[name="billingName"]')
    .fill("Test User")
    .catch(() => {});

  // Country may default to US — set to JP if available
  const countrySelect = page.locator('select[name="billingCountry"]');
  if (await countrySelect.count()) {
    await countrySelect.selectOption("JP").catch(() => {});
  }

  // ZIP / postal code (only if visible)
  const zip = page.locator('input[name="billingPostalCode"]');
  if (await zip.count()) {
    await zip.fill("100-0001").catch(() => {});
  }

  // 5. Submit
  console.log("\n--- submit ---");
  await page
    .getByTestId("hosted-payment-submit-button")
    .click()
    .catch(async () => {
      // Fallback: any submit button containing 申し込む / Subscribe / Pay
      await page
        .locator('button[type="submit"]')
        .first()
        .click();
    });

  // 6. Wait for redirect back to mypage
  console.log("\n--- waiting for redirect back to /mypage?checkout=success ---");
  await page.waitForURL(
    (url) => url.toString().startsWith(`${APP_URL}/mypage`),
    { timeout: 60_000 },
  );
  console.log("redirected back, URL:", page.url());

  // 7. Allow webhook a few seconds to settle
  console.log("\n--- waiting 3s for webhook to be processed ---");
  await wait(3000);

  // 8. Verify DB state
  console.log("\n--- post-checkout DB state ---");
  const after = await fetchDbState();
  console.log(JSON.stringify(after, null, 2));

  await browser.close();

  // ---- Assertions ----
  const failures = [];
  if (after.user.role !== "client") {
    failures.push(`users.role expected 'client' but got '${after.user.role}'`);
  }
  if (!after.user.stripe_customer_id) {
    failures.push("users.stripe_customer_id not populated");
  }
  const newSub = after.subs.find((s) => s.status === "active");
  if (!newSub) {
    failures.push("no active subscription row found");
  } else if (newSub.plan_type !== "individual") {
    failures.push(
      `subscription plan_type expected 'individual' but got '${newSub.plan_type}'`,
    );
  }
  const completedEvent = after.events.find(
    (e) =>
      e.event_type === "checkout.session.completed" && e.status === "completed",
  );
  if (!completedEvent) {
    failures.push(
      "no stripe_webhook_events row with event_type='checkout.session.completed' and status='completed'",
    );
  }

  console.log("\n--- result ---");
  if (failures.length === 0) {
    console.log("✓ ALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.error("✗ FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
