#!/usr/bin/env node
/**
 * Task 16: Automated Stripe CLI integration test.
 *
 * Pre-reqs (handled by caller):
 *   1. supabase start && supabase db reset
 *   2. stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   3. npm run dev
 *
 * Tests performed:
 *   ① Corporate plan purchase → /mypage/organization-setup → org name save
 *   ② Subscription deletion via Stripe API → users.role reverts to contractor
 *   ③ Re-purchase individual plan → users.role becomes client again
 *   ④ Compensation option purchase → client_profiles.is_compensation_5000 = true
 *   ⑤ PastDueBanner visible for past_due seed user
 *   ⑥ Urgent option UI visible with job dropdown (no purchase — would need a separate checkout)
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { setTimeout as wait } from "node:timers/promises";

const APP_URL = "http://localhost:3000";
const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY are required");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" });

const CONTRACTOR = { id: "11111111-1111-1111-1111-111111111111", email: "contractor@test.local", password: "testpass123" };
const CLIENT = { id: "22222222-2222-2222-2222-222222222222", email: "client@test.local", password: "testpass123" };
const PASTDUE = { email: "pastdue@test.local", password: "testpass123" };

async function queryUser(userId) {
  const { data } = await admin.from("users").select("role, stripe_customer_id").eq("id", userId).single();
  return data;
}

async function querySubscriptions(userId) {
  const { data } = await admin.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return data ?? [];
}

async function login(page, email, password) {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/(mypage|admin)/);
}

async function doStripeCheckout(page, buttonSelector) {
  await page.goto(`${APP_URL}/billing`);
  await page.waitForSelector(buttonSelector);
  await page.click(buttonSelector);
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.waitForSelector('input[name="cardNumber"]', { timeout: 30_000 });
  await page.locator('input[name="email"]').fill(CONTRACTOR.email).catch(() => {});
  await page.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
  await page.locator('input[name="cardExpiry"]').fill("12 / 30");
  await page.locator('input[name="cardCvc"]').fill("123");
  await page.locator('input[name="billingName"]').fill("Test User").catch(() => {});
  const zip = page.locator('input[name="billingPostalCode"]');
  if (await zip.count()) await zip.fill("100-0001").catch(() => {});
  await page.getByTestId("hosted-payment-submit-button").click().catch(async () => {
    await page.locator('button[type="submit"]').first().click();
  });
}

const results = [];
function log(test, pass, detail = "") {
  const icon = pass ? "✅" : "❌";
  results.push({ test, result: pass ? "PASS" : "FAIL", detail });
  console.log(`${icon} ${test}${detail ? ": " + detail : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    // ================================================================
    // ① Corporate plan purchase → /mypage/organization-setup
    // ================================================================
    console.log("\n--- ① Corporate plan purchase ---");
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await login(page1, CONTRACTOR.email, CONTRACTOR.password);

    // Need to add data-testid to find corporate button. Use text match instead.
    await page1.goto(`${APP_URL}/billing`);
    // Click the corporate plan "申し込む" button (4th plan)
    const buyButtons = await page1.getByRole("button", { name: "申し込む" }).all();
    if (buyButtons.length >= 3) {
      await buyButtons[2].click(); // 0=individual, 1=small, 2=corporate, 3=corp_premium
      await page1.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
      await page1.waitForSelector('input[name="cardNumber"]', { timeout: 30_000 });
      await page1.locator('input[name="email"]').fill(CONTRACTOR.email).catch(() => {});
      await page1.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
      await page1.locator('input[name="cardExpiry"]').fill("12 / 30");
      await page1.locator('input[name="cardCvc"]').fill("123");
      await page1.locator('input[name="billingName"]').fill("Test Corp").catch(() => {});
      const zip = page1.locator('input[name="billingPostalCode"]');
      if (await zip.count()) await zip.fill("100-0001").catch(() => {});
      await page1.getByTestId("hosted-payment-submit-button").click().catch(async () => {
        await page1.locator('button[type="submit"]').first().click();
      });

      // Should redirect to /mypage/organization-setup
      await page1.waitForURL(/organization-setup/, { timeout: 60_000 });
      log("① Corporate plan → organization-setup redirect", true, page1.url());

      // Wait for webhook
      await wait(3000);
      const user1 = await queryUser(CONTRACTOR.id);
      log("① users.role = client", user1?.role === "client", `role=${user1?.role}`);

      const subs1 = await querySubscriptions(CONTRACTOR.id);
      const activeSub = subs1.find(s => s.status === "active");
      log("① subscriptions active corporate", activeSub?.plan_type === "corporate", `plan=${activeSub?.plan_type}`);

      // Check organizations created
      const { data: org } = await admin.from("organizations").select("id, name").eq("owner_id", CONTRACTOR.id).is("deleted_at", null).maybeSingle();
      log("① organization created (empty name)", !!org && org.name === "", `name='${org?.name}'`);

      // Fill in org name
      await page1.getByLabel("組織名").fill("テスト自動化建設");
      await page1.getByRole("button", { name: "保存する" }).click();
      await page1.waitForURL(/\/mypage\?setup_completed/, { timeout: 10_000 });
      log("① org name saved → /mypage?setup_completed", true);

      // Verify org name updated
      const { data: org2 } = await admin.from("organizations").select("name").eq("owner_id", CONTRACTOR.id).is("deleted_at", null).maybeSingle();
      log("① organizations.name updated", org2?.name === "テスト自動化建設", `name='${org2?.name}'`);

      // ================================================================
      // ② Subscription deletion → role reverts
      // ================================================================
      console.log("\n--- ② Subscription cancellation ---");
      if (activeSub?.stripe_subscription_id) {
        await stripe.subscriptions.cancel(activeSub.stripe_subscription_id);
        console.log("  Stripe subscription cancelled, waiting for webhook...");
        await wait(5000);

        const user2 = await queryUser(CONTRACTOR.id);
        log("② users.role reverted to contractor", user2?.role === "contractor", `role=${user2?.role}`);

        const subs2 = await querySubscriptions(CONTRACTOR.id);
        const cancelledSub = subs2.find(s => s.stripe_subscription_id === activeSub.stripe_subscription_id);
        log("② subscription status = cancelled", cancelledSub?.status === "cancelled", `status=${cancelledSub?.status}`);
      } else {
        log("② Subscription cancellation", false, "no stripe_subscription_id found");
      }

      // ================================================================
      // ③ Re-purchase individual plan
      // ================================================================
      console.log("\n--- ③ Re-purchase individual plan ---");
      await page1.goto(`${APP_URL}/billing`);
      await page1.waitForSelector('button:has-text("申し込む")');
      const reBuyButtons = await page1.getByRole("button", { name: "申し込む" }).all();
      if (reBuyButtons.length >= 1) {
        await reBuyButtons[0].click(); // individual plan
        await page1.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
        await page1.waitForSelector('input[name="cardNumber"]', { timeout: 30_000 });
        await page1.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
        await page1.locator('input[name="cardExpiry"]').fill("12 / 30");
        await page1.locator('input[name="cardCvc"]').fill("123");
        await page1.locator('input[name="billingName"]').fill("Test User").catch(() => {});
        const zip2 = page1.locator('input[name="billingPostalCode"]');
        if (await zip2.count()) await zip2.fill("100-0001").catch(() => {});
        await page1.getByTestId("hosted-payment-submit-button").click().catch(async () => {
          await page1.locator('button[type="submit"]').first().click();
        });
        await page1.waitForURL(/\/mypage/, { timeout: 60_000 });
        await wait(3000);

        const user3 = await queryUser(CONTRACTOR.id);
        log("③ Re-purchase: users.role = client", user3?.role === "client", `role=${user3?.role}`);
      }
    } else {
      log("① Corporate plan purchase", false, "not enough 申し込む buttons");
    }
    await ctx1.close();

    // ================================================================
    // ④ Compensation option purchase (using existing client)
    // ================================================================
    console.log("\n--- ④ Compensation option purchase ---");
    const ctx4 = await browser.newContext();
    const page4 = await ctx4.newPage();
    await login(page4, CLIENT.email, CLIENT.password);
    await page4.goto(`${APP_URL}/billing`);

    // Find the compensation 5000 "申し込む" button — it's inside the section that
    // contains the compensation description text.
    const comp5000Btn = page4.getByRole("button", { name: "補償（5,000円）を申し込む" });
    if (await comp5000Btn.isVisible().catch(() => false)) {
      await comp5000Btn.click();
      await page4.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
      await page4.waitForSelector('input[name="cardNumber"]', { timeout: 30_000 });
      await page4.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
      await page4.locator('input[name="cardExpiry"]').fill("12 / 30");
      await page4.locator('input[name="cardCvc"]').fill("123");
      await page4.locator('input[name="billingName"]').fill("Comp Test").catch(() => {});
      const zip3 = page4.locator('input[name="billingPostalCode"]');
      if (await zip3.count()) await zip3.fill("100-0001").catch(() => {});
      await page4.getByTestId("hosted-payment-submit-button").click().catch(async () => {
        await page4.locator('button[type="submit"]').first().click();
      });
      await page4.waitForURL(/billing/, { timeout: 60_000 });
      await wait(3000);

      const { data: cp } = await admin.from("client_profiles")
        .select("is_compensation_5000").eq("user_id", CLIENT.id).single();
      log("④ client_profiles.is_compensation_5000 = true", cp?.is_compensation_5000 === true, `value=${cp?.is_compensation_5000}`);
    } else {
      log("④ Compensation option", false, "button not visible (may already be subscribed)");
    }
    await ctx4.close();

    // ================================================================
    // ⑤ PastDueBanner visible for past_due user
    // ================================================================
    console.log("\n--- ⑤ PastDueBanner for past_due user ---");
    const ctx5 = await browser.newContext();
    const page5 = await ctx5.newPage();
    await login(page5, PASTDUE.email, PASTDUE.password);
    await page5.goto(`${APP_URL}/mypage`);
    const bannerVisible = await page5.getByRole("button", { name: "お支払い方法を更新する" }).isVisible().catch(() => false);
    log("⑤ PastDueBanner visible on /mypage", bannerVisible);
    await ctx5.close();

    // ================================================================
    // ⑥ Urgent option dropdown visible with jobs
    // ================================================================
    console.log("\n--- ⑥ Urgent option UI ---");
    const ctx6 = await browser.newContext();
    const page6 = await ctx6.newPage();
    await login(page6, CLIENT.email, CLIENT.password);
    await page6.goto(`${APP_URL}/billing`);
    // Just check if the "案件を選択" placeholder text is visible anywhere on the page
    const dropdownVisible = await page6.getByText("案件を選択").isVisible().catch(() => false);
    log("⑥ Urgent option job dropdown visible", dropdownVisible);
    await ctx6.close();

  } finally {
    await browser.close();
  }

  // ================================================================
  // Summary
  // ================================================================
  console.log("\n========================================");
  console.log("Task 16 Integration Test Results:");
  console.log("========================================");
  console.table(results);

  const failures = results.filter(r => r.result === "FAIL");
  if (failures.length === 0) {
    console.log("\n✓ ALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.log(`\n✗ ${failures.length} FAILED:`);
    for (const f of failures) console.log(`  - ${f.test}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
