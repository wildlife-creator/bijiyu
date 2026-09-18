#!/usr/bin/env node
/**
 * A1（年払い）・A2（動画プラン）で作った Stripe リソースと .env.local の対応を検証する。
 * cp1-verify-stripe.mjs（月額・事務手数料・既存オプション）の対象外を補完する。秘密は表示しない。
 *
 *   node scripts/stripe/verify-new-prices.mjs
 *
 * 確認すること:
 *   1. 年払い Price 4 本: 金額（月額 × 10）・年次課金・有効
 *   2. 動画プラン 2 本: 金額・一回限り・有効
 *   3. プラン変更用ポータル設定: subscription_update が有効であること
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

const EXPECTED = [
  { envVar: "STRIPE_PRICE_INDIVIDUAL_YEARLY", label: "ライト（年払い）", amount: 28000, interval: "year" },
  { envVar: "STRIPE_PRICE_SMALL_YEARLY", label: "スタンダード（年払い）", amount: 98000, interval: "year" },
  { envVar: "STRIPE_PRICE_CORPORATE_YEARLY", label: "プレミアム（年払い）", amount: 280000, interval: "year" },
  { envVar: "STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY", label: "ハイエンド（年払い）", amount: 1680000, interval: "year" },
  { envVar: "STRIPE_PRICE_VIDEO_SHOOTING", label: "ユーザー撮影動画制作プラン", amount: 20000, interval: null },
  { envVar: "STRIPE_PRICE_VIDEO_SNS", label: "ビジ友公式SNS動画制作プラン", amount: 120000, interval: null },
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
console.log(`\nStripe ${mode} モードで確認します\n`);

let failures = 0;

for (const item of EXPECTED) {
  const id = process.env[item.envVar];
  if (!id || id.includes("REPLACE_ME")) {
    console.log(`✖ ${item.label}: ${item.envVar} が .env.local にありません`);
    failures += 1;
    continue;
  }
  let price;
  try {
    price = await stripe.prices.retrieve(id);
  } catch (err) {
    console.log(`✖ ${item.label}: ${id} を取得できません（${err.message}）→ 貼り間違いの可能性`);
    failures += 1;
    continue;
  }
  const issues = [];
  if (price.currency !== "jpy") issues.push(`通貨=${price.currency}（jpy であるべき）`);
  if (price.unit_amount !== item.amount) issues.push(`金額=${price.unit_amount}（${item.amount} であるべき）`);
  const interval = price.recurring?.interval ?? null;
  if (interval !== item.interval) {
    issues.push(`課金形態=${interval ?? "一回限り"}（${item.interval ?? "一回限り"} であるべき）`);
  }
  if (!price.active) issues.push("アーカイブ済み（active=false）");

  if (issues.length === 0) {
    const kind = item.interval ? `${price.unit_amount.toLocaleString("ja-JP")}円/${item.interval === "year" ? "年" : "月"}` : `${price.unit_amount.toLocaleString("ja-JP")}円・一回限り`;
    console.log(`✔ ${item.label}: ${id}（${kind}）`);
  } else {
    console.log(`✖ ${item.label}: ${id} → ${issues.join(", ")}`);
    failures += 1;
  }
}

// プラン変更用ポータル設定
const portalId = process.env.STRIPE_PORTAL_UPDATE_CONFIGURATION_ID;
if (!portalId || portalId.includes("REPLACE_ME")) {
  console.log("✖ STRIPE_PORTAL_UPDATE_CONFIGURATION_ID が .env.local にありません");
  failures += 1;
} else {
  try {
    const config = await stripe.billingPortal.configurations.retrieve(portalId);
    const su = config.features?.subscription_update;
    if (su?.enabled) {
      const productCount = su.products?.length ?? 0;
      console.log(`✔ プラン変更用ポータル設定: ${portalId}（subscription_update 有効、対象商品 ${productCount} 件）`);
      if (productCount !== 4) {
        console.log(`  ⚠ 対象商品が 4 件ではありません（基本プラン 4 商品が想定）`);
        // 原因調査用に subscription_update の中身（ID のみ・秘密なし）を表示する
        console.log(`  詳細: ${JSON.stringify(su, null, 2)}`);
      }
    } else {
      console.log(`✖ プラン変更用ポータル設定: ${portalId} → subscription_update が無効です`);
      failures += 1;
    }
  } catch (err) {
    console.log(`✖ プラン変更用ポータル設定: ${portalId} を取得できません（${err.message}）`);
    failures += 1;
  }
}

if (failures > 0) {
  console.log(`\n⚠ ${failures} 件の問題があります。上の ✖ を確認してください。`);
  process.exit(1);
}
console.log("\n✓ 年払い・動画プラン・ポータル設定の確認がすべて通りました");
