#!/usr/bin/env node
/**
 * P3（Stripe 年払い）の Stripe 側セットアップを 1 コマンドで行う。
 *
 *   node scripts/stripe/setup-yearly-prices.mjs
 *
 * やること（すべて冪等。何度実行しても同じ結果になる）:
 *   1. 既存の月額 Price（STRIPE_PRICE_INDIVIDUAL 等）から商品（Product）を特定し、
 *      その商品に「年ごと・自動更新」の年額 Price を作る（lookup_key で重複作成を防ぐ）
 *   2. プラン変更確認用の Customer Portal 設定（subscription_update を許可、
 *      月額 4 + 年額 4 の Price を切替先として登録）を作成 / 更新する
 *   3. .env.local に貼る 5 行を表示する
 *
 * 必要な環境変数（.env.local から読む）:
 *   STRIPE_SECRET_KEY, STRIPE_PRICE_INDIVIDUAL, STRIPE_PRICE_SMALL,
 *   STRIPE_PRICE_CORPORATE, STRIPE_PRICE_CORPORATE_PREMIUM
 *   （任意）STRIPE_PORTAL_UPDATE_CONFIGURATION_ID … 既にあれば更新、無ければ新規作成
 *   （任意）YEARLY_AMOUNTS … 年額を上書きしたいとき。例: "45600,177600,576000,1776000"
 *          （ライト, スタンダード, プレミアム, ハイエンド の順、税込円）。未指定は月額 × 12
 *
 * テストモードの鍵で実行すれば staging 用、本番の鍵で実行すれば本番用の ID が出る。
 * 既存の STRIPE_PORTAL_CONFIGURATION_ID（カード更新 + 請求履歴のみ）には触らない。
 */

import { readFileSync } from "node:fs";
import Stripe from "stripe";

// .env.local を読む（dotenv に依存しない簡易パーサ。KEY=VALUE 形式、# 行は無視）
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch {
  // .env.local が無い場合は環境変数のみで動く（CI / 本番用）
}

const PLANS = [
  { key: "INDIVIDUAL", label: "ライトプラン", lookupKey: "bijiyu_individual_yearly" },
  { key: "SMALL", label: "スタンダードプラン", lookupKey: "bijiyu_small_yearly" },
  { key: "CORPORATE", label: "プレミアムプラン", lookupKey: "bijiyu_corporate_yearly" },
  { key: "CORPORATE_PREMIUM", label: "ハイエンドプラン", lookupKey: "bijiyu_corporate_premium_yearly" },
];

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey || secretKey.includes("xxx")) {
  fail("STRIPE_SECRET_KEY が .env.local に設定されていません");
}
const stripe = new Stripe(secretKey);

const mode = secretKey.startsWith("sk_live_") ? "本番（live）" : "テスト（test）";
console.log(`\nStripe ${mode} モードで実行します\n`);

const overrideAmounts = process.env.YEARLY_AMOUNTS
  ? process.env.YEARLY_AMOUNTS.split(",").map((v) => Number(v.trim()))
  : null;
if (overrideAmounts && (overrideAmounts.length !== 4 || overrideAmounts.some((n) => !Number.isInteger(n) || n <= 0))) {
  fail("YEARLY_AMOUNTS は税込円の整数 4 つをカンマ区切りで指定してください（ライト,スタンダード,プレミアム,ハイエンド）");
}

// ---------------------------------------------------------------------------
// 1. 年額 Price
// ---------------------------------------------------------------------------
const yearlyPriceIds = {};
const allPriceIdsByProduct = new Map(); // productId → { monthly, yearly }

for (const [index, plan] of PLANS.entries()) {
  const monthlyPriceId = process.env[`STRIPE_PRICE_${plan.key}`];
  if (!monthlyPriceId || monthlyPriceId.includes("REPLACE_ME")) {
    fail(`STRIPE_PRICE_${plan.key}（月額 Price ID）が .env.local に設定されていません`);
  }

  const monthly = await stripe.prices.retrieve(monthlyPriceId);
  const productId = typeof monthly.product === "string" ? monthly.product : monthly.product.id;
  const monthlyAmount = monthly.unit_amount ?? 0;
  const yearlyAmount = overrideAmounts ? overrideAmounts[index] : monthlyAmount * 12;

  // 既存の年額 Price（lookup_key で検索）
  const existing = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
  let yearly = existing.data[0];

  if (yearly && yearly.unit_amount !== yearlyAmount) {
    // 金額が変わった場合は旧 Price を無効化して作り直す（Stripe の Price は金額変更不可）
    console.log(`  ↻ ${plan.label}: 年額が ${yearly.unit_amount} → ${yearlyAmount} 円に変わるため作り直します`);
    await stripe.prices.update(yearly.id, { active: false, lookup_key: `${plan.lookupKey}_old_${Date.now()}` });
    yearly = undefined;
  }

  if (!yearly) {
    yearly = await stripe.prices.create({
      product: productId,
      currency: "jpy",
      unit_amount: yearlyAmount,
      recurring: { interval: "year" },
      lookup_key: plan.lookupKey,
      nickname: `${plan.label}（年払い）`,
      metadata: { plan_key: plan.key.toLowerCase(), billing_cycle: "yearly" },
    });
    console.log(`  ✔ ${plan.label}: 年額 Price を作成 ${yearly.id}（${yearlyAmount.toLocaleString("ja-JP")}円/年）`);
  } else {
    console.log(`  ✔ ${plan.label}: 年額 Price は既存 ${yearly.id}（${yearly.unit_amount.toLocaleString("ja-JP")}円/年）`);
  }

  yearlyPriceIds[plan.key] = yearly.id;
  allPriceIdsByProduct.set(productId, { monthly: monthlyPriceId, yearly: yearly.id });
}

// ---------------------------------------------------------------------------
// 2. プラン変更確認用の Customer Portal 設定
// ---------------------------------------------------------------------------
const products = Array.from(allPriceIdsByProduct.entries()).map(([productId, prices]) => ({
  product: productId,
  prices: [prices.monthly, prices.yearly],
}));

const portalParams = {
  business_profile: { headline: "ビジ友 プラン変更" },
  features: {
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products,
    },
    // このポータル設定はプラン変更確認専用。他の操作は許可しない
    subscription_cancel: { enabled: false },
    payment_method_update: { enabled: false },
    invoice_history: { enabled: false },
    customer_update: { enabled: false },
  },
  metadata: { purpose: "bijiyu_plan_change_confirm" },
};

let updateConfigId = process.env.STRIPE_PORTAL_UPDATE_CONFIGURATION_ID;
if (updateConfigId && !updateConfigId.includes("REPLACE_ME")) {
  await stripe.billingPortal.configurations.update(updateConfigId, portalParams);
  console.log(`\n  ✔ プラン変更用ポータル設定を更新 ${updateConfigId}`);
} else {
  // 既に同目的の設定があれば再利用
  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  const found = list.data.find((c) => c.metadata?.purpose === "bijiyu_plan_change_confirm");
  if (found) {
    await stripe.billingPortal.configurations.update(found.id, portalParams);
    updateConfigId = found.id;
    console.log(`\n  ✔ プラン変更用ポータル設定を更新（既存を再利用） ${updateConfigId}`);
  } else {
    const created = await stripe.billingPortal.configurations.create(portalParams);
    updateConfigId = created.id;
    console.log(`\n  ✔ プラン変更用ポータル設定を作成 ${updateConfigId}`);
  }
}

// ---------------------------------------------------------------------------
// 3. .env.local に貼る行
// ---------------------------------------------------------------------------
console.log(`
==============================================================
以下の 5 行を .env.local（staging / 本番は Vercel の環境変数）に貼ってください
==============================================================
STRIPE_PRICE_INDIVIDUAL_YEARLY=${yearlyPriceIds.INDIVIDUAL}
STRIPE_PRICE_SMALL_YEARLY=${yearlyPriceIds.SMALL}
STRIPE_PRICE_CORPORATE_YEARLY=${yearlyPriceIds.CORPORATE}
STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY=${yearlyPriceIds.CORPORATE_PREMIUM}
STRIPE_PORTAL_UPDATE_CONFIGURATION_ID=${updateConfigId}
==============================================================
`);
