#!/usr/bin/env node
/**
 * プラン変更用ポータル設定（STRIPE_PORTAL_UPDATE_CONFIGURATION_ID）の中身を
 * そのまま表示して、「対象商品 0 件」の原因を調べる。秘密は表示しない。
 *
 *   node scripts/stripe/debug-portal.mjs
 */

import { readFileSync } from "node:fs";
import Stripe from "stripe";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch {}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey || secretKey.includes("xxx")) {
  console.error("STRIPE_SECRET_KEY が .env.local に設定されていません");
  process.exit(1);
}
const stripe = new Stripe(secretKey);

const id = process.env.STRIPE_PORTAL_UPDATE_CONFIGURATION_ID;
if (!id) {
  console.error("STRIPE_PORTAL_UPDATE_CONFIGURATION_ID が .env.local にありません");
  process.exit(1);
}

const config = await stripe.billingPortal.configurations.retrieve(id);

console.log(`\nポータル設定 ${id} の中身（features.subscription_update）:\n`);
console.log(JSON.stringify(config.features?.subscription_update, null, 2));
console.log(`\nactive: ${config.active} / livemode: ${config.livemode}`);
console.log(`metadata: ${JSON.stringify(config.metadata)}`);
console.log(`（参考）features に存在するキー: ${Object.keys(config.features ?? {}).join(", ")}`);
