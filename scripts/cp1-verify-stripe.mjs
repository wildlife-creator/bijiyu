#!/usr/bin/env node
/**
 * Verify that the Stripe env vars set in .env.local correspond to real
 * Stripe test-mode resources, and that each price has the expected amount,
 * currency, and recurrence type.
 *
 * Run: `node --env-file=.env.local scripts/cp1-verify-stripe.mjs`
 */
import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("STRIPE_SECRET_KEY missing");
  process.exit(1);
}
if (!SECRET.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY does not start with sk_test_ — refusing");
  process.exit(1);
}

const stripe = new Stripe(SECRET, { apiVersion: "2026-02-25.clover" });

/**
 * Expected price config per env var.
 *   amount     — JPY integer (smallest unit, 1 = ¥1 since JPY has no decimals)
 *   recurring  — true=subscription, false=one_time
 */
const EXPECTED = {
  STRIPE_PRICE_INDIVIDUAL: { amount: 3800, recurring: true, label: "個人発注者様向けプラン" },
  STRIPE_PRICE_SMALL: { amount: 14800, recurring: true, label: "小規模事業主様向けプラン" },
  STRIPE_PRICE_CORPORATE: { amount: 48000, recurring: true, label: "法人向けプラン" },
  STRIPE_PRICE_CORPORATE_PREMIUM: { amount: 148000, recurring: true, label: "法人向けプラン（高サポート）" },
  STRIPE_PRICE_INITIAL_FEE: { amount: 20000, recurring: false, label: "初期費用" },
  STRIPE_PRICE_COMPENSATION_5000: { amount: 5000, recurring: true, label: "補償オプション ¥5,000/月" },
  STRIPE_PRICE_COMPENSATION_9800: { amount: 9800, recurring: true, label: "補償オプション ¥9,800/月" },
  STRIPE_PRICE_URGENT: { amount: 20000, recurring: false, label: "急募オプション" },
  STRIPE_PRICE_VIDEO: { amount: 100000, recurring: false, label: "動画掲載オプション" },
};

async function verifyAccount() {
  try {
    const account = await stripe.accounts.retrieve();
    return { ok: true, id: account.id, country: account.country };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function verifyPrice(envVar, expected) {
  const id = process.env[envVar];
  if (!id) return { envVar, status: "MISSING", expected };
  if (!id.startsWith("price_")) {
    return { envVar, status: "BAD_PREFIX", id, expected };
  }
  try {
    const price = await stripe.prices.retrieve(id);
    const amount = price.unit_amount;
    const currency = price.currency;
    const isRecurring = price.recurring != null;
    const interval = price.recurring?.interval ?? "(none)";

    const issues = [];
    if (currency !== "jpy") issues.push(`currency=${currency} (want jpy)`);
    if (amount !== expected.amount) {
      issues.push(`amount=${amount} (want ${expected.amount})`);
    }
    if (isRecurring !== expected.recurring) {
      issues.push(
        `recurring=${isRecurring} (want ${expected.recurring})`,
      );
    }
    if (expected.recurring && interval !== "month") {
      issues.push(`interval=${interval} (want month)`);
    }
    if (price.active !== true) issues.push(`active=false`);

    return {
      envVar,
      label: expected.label,
      id,
      amount,
      currency,
      type: isRecurring ? `recurring/${interval}` : "one_time",
      active: price.active,
      status: issues.length === 0 ? "OK" : `MISMATCH: ${issues.join(", ")}`,
    };
  } catch (err) {
    return { envVar, id, status: `ERROR: ${err.message}` };
  }
}

async function verifyPortalConfig() {
  const id = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (!id) return { status: "MISSING" };
  try {
    const config = await stripe.billingPortal.configurations.retrieve(id);
    const features = config.features;
    const enabledFeatures = [];
    if (features.invoice_history?.enabled) enabledFeatures.push("invoice_history");
    if (features.payment_method_update?.enabled) enabledFeatures.push("payment_method_update");
    if (features.customer_update?.enabled) enabledFeatures.push("customer_update");
    if (features.subscription_cancel?.enabled) enabledFeatures.push("subscription_cancel");
    if (features.subscription_update?.enabled) enabledFeatures.push("subscription_update");
    if (features.subscription_pause?.enabled) enabledFeatures.push("subscription_pause");

    // 設計上は invoice_history と payment_method_update のみ enabled であるべき
    const allowed = new Set(["invoice_history", "payment_method_update"]);
    const unexpected = enabledFeatures.filter((f) => !allowed.has(f));

    return {
      id,
      enabledFeatures,
      unexpected,
      status:
        unexpected.length === 0
          ? "OK (only invoice_history + payment_method_update)"
          : `WARNING: unexpected features enabled — ${unexpected.join(", ")}`,
    };
  } catch (err) {
    return { id, status: `ERROR: ${err.message}` };
  }
}

const account = await verifyAccount();
console.log("--- Account ---");
console.log(account);
console.log();

console.log("--- Prices ---");
const priceResults = [];
for (const [envVar, expected] of Object.entries(EXPECTED)) {
  priceResults.push(await verifyPrice(envVar, expected));
}
console.table(priceResults);

console.log();
console.log("--- Customer Portal Configuration ---");
const portalResult = await verifyPortalConfig();
console.log(portalResult);

const failures = priceResults.filter((r) => r.status !== "OK");
const portalOk = portalResult.status?.startsWith("OK");
if (failures.length > 0 || !portalOk || !account.ok) {
  console.log();
  console.log("⚠ One or more checks failed. Review the table above.");
  process.exit(1);
}
console.log();
console.log("✓ All Stripe configuration checks passed.");
