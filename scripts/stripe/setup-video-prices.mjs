#!/usr/bin/env node
/**
 * A2（P7 / P10 動画プラン）の Stripe 側セットアップを 1 コマンドで行う。
 *
 *   node scripts/stripe/setup-video-prices.mjs
 *
 * やること（すべて冪等。何度実行しても同じ結果になる）:
 *   1. 「ユーザー撮影動画制作プラン」（一回限り ¥20,000）の商品 + Price を作る（P7）
 *   2. 「ビジ友公式SNS動画制作プラン」（一回限り ¥120,000）の商品 + Price を作る（P10）
 *   3. 既存の「自己PR動画掲載」商品（STRIPE_PRICE_VIDEO の商品）の名称を
 *      「プロフィール動画制作プラン」に変更する（Price ID はそのまま）（P10）
 *   4. .env.local / Vercel に貼る 2 行を表示する
 *
 * 必要な環境変数（.env.local から読む）:
 *   STRIPE_SECRET_KEY, STRIPE_PRICE_VIDEO（名称変更の対象を特定するため）
 *
 * 旧「職場紹介動画掲載」の Price は 2026-09-18 にアプリから廃止済み（Stripe 側はアーカイブしてよい。このスクリプトでは触らない）。
 *
 * テストモードの鍵で実行すれば staging 用、本番の鍵で実行すれば本番用の ID が出る。
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
  // .env.local が無い場合は環境変数のみで動く
}

const NEW_PLANS = [
  {
    envVar: "STRIPE_PRICE_VIDEO_SHOOTING",
    productName: "ユーザー撮影動画制作プラン",
    amount: 20000,
    lookupKey: "bijiyu_video_shooting",
  },
  {
    envVar: "STRIPE_PRICE_VIDEO_SNS",
    productName: "ビジ友公式SNS動画制作プラン",
    amount: 120000,
    lookupKey: "bijiyu_video_sns",
  },
];

const RENAMED_PRODUCT_NAME = "プロフィール動画制作プラン";

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

// ---------------------------------------------------------------------------
// 1. 新プラン 2 本（商品 + 一回限り Price）
// ---------------------------------------------------------------------------
const newPriceIds = {};

for (const plan of NEW_PLANS) {
  // 既存の Price（lookup_key で検索。再実行しても二重作成しない）
  const existing = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
  let price = existing.data[0];

  if (price && price.unit_amount !== plan.amount) {
    console.log(`  ↻ ${plan.productName}: 既存の ${price.id} は金額違いのためアーカイブして作り直します`);
    await stripe.prices.update(price.id, { active: false, lookup_key: `${plan.lookupKey}_old_${Date.now()}` });
    price = undefined;
  }

  if (!price) {
    const product = await stripe.products.create({ name: plan.productName });
    price = await stripe.prices.create({
      product: product.id,
      currency: "jpy",
      unit_amount: plan.amount,
      lookup_key: plan.lookupKey,
      nickname: plan.productName,
      metadata: { plan_key: plan.envVar.toLowerCase() },
    });
    console.log(
      `  ✔ ${plan.productName}: 商品と Price を作成 ${price.id}（${plan.amount.toLocaleString("ja-JP")}円・一回限り）`,
    );
  } else {
    console.log(`  ✔ ${plan.productName}: Price は既存 ${price.id}（${price.unit_amount.toLocaleString("ja-JP")}円）`);
  }

  newPriceIds[plan.envVar] = price.id;
}

// ---------------------------------------------------------------------------
// 2. 旧「自己PR動画掲載」商品の名称変更
// ---------------------------------------------------------------------------
const videoPriceId = process.env.STRIPE_PRICE_VIDEO;
if (!videoPriceId || videoPriceId.includes("REPLACE_ME")) {
  console.log(`\n  ⚠ STRIPE_PRICE_VIDEO が .env.local に無いため、商品の名称変更はスキップしました`);
} else {
  const videoPrice = await stripe.prices.retrieve(videoPriceId, { expand: ["product"] });
  const product = videoPrice.product;
  if (typeof product === "object" && product.name !== RENAMED_PRODUCT_NAME) {
    await stripe.products.update(product.id, { name: RENAMED_PRODUCT_NAME });
    console.log(`\n  ✔ 商品名を変更: 「${product.name}」→「${RENAMED_PRODUCT_NAME}」（Price ID はそのまま）`);
  } else if (typeof product === "object") {
    console.log(`\n  ✔ 商品名はすでに「${RENAMED_PRODUCT_NAME}」です`);
  }
}

// ---------------------------------------------------------------------------
// 3. .env.local / Vercel に貼る行
// ---------------------------------------------------------------------------
console.log(`
==============================================================
以下の 2 行を .env.local と Vercel（staging）の環境変数に貼ってください
==============================================================
STRIPE_PRICE_VIDEO_SHOOTING=${newPriceIds.STRIPE_PRICE_VIDEO_SHOOTING}
STRIPE_PRICE_VIDEO_SNS=${newPriceIds.STRIPE_PRICE_VIDEO_SNS}
==============================================================
`);
