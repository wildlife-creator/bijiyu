#!/usr/bin/env node
/**
 * A0（P11 価格改定）の後片付け: 旧月額 Price に紐づく staging のテスト契約 4 件を
 * 即時解約する（2026-09-10 の setup-monthly-prices.mjs 実行時に検出されたもの）。
 *
 *   node scripts/stripe/cancel-old-price-test-subs.mjs
 *
 * 安全装置:
 *   - 対象はこのファイルに書かれた契約 ID のみ（それ以外には触らない）
 *   - テストモードの鍵（sk_test_）でなければ何もせず終了する
 *   - 顧客のメールアドレスが @test.local でなければその契約はスキップする
 *   - すでに解約済みならスキップする（何度実行しても安全）
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

// 解約対象（setup-monthly-prices.mjs の 2026-09-10 実行結果より）
const TARGET_SUBSCRIPTIONS = [
  { id: "sub_1TnJaVR1gPIkMTMdnUcJX1A5", note: "ライトプラン / individual-client@test.local" },
  { id: "sub_1Tm3ibR1gPIkMTMd8JULDgJP", note: "プレミアムプラン / er-c-owner@test.local" },
  { id: "sub_1TirzPR1gPIkMTMdVnlzm6kM", note: "プレミアムプラン / try-invite@test.local" },
  { id: "sub_1TisQrR1gPIkMTMdvOFC95hc", note: "ハイエンドプラン / try-invite2@test.local" },
];

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey || secretKey.includes("xxx")) {
  fail("STRIPE_SECRET_KEY が .env.local に設定されていません");
}
if (!secretKey.startsWith("sk_test_")) {
  fail("テストモードの鍵（sk_test_）ではないため中止します（このスクリプトは staging 専用）");
}
const stripe = new Stripe(secretKey);

console.log("\nStripe テスト（test）モードで実行します\n");

let cancelled = 0;
let skipped = 0;

for (const target of TARGET_SUBSCRIPTIONS) {
  let sub;
  try {
    sub = await stripe.subscriptions.retrieve(target.id, { expand: ["customer"] });
  } catch (err) {
    console.log(`  ⚠ ${target.note}: 取得できませんでした（${err.message}）→ スキップ`);
    skipped += 1;
    continue;
  }

  if (["canceled", "incomplete_expired"].includes(sub.status)) {
    console.log(`  ✔ ${target.note}: すでに解約済み（status=${sub.status}）`);
    skipped += 1;
    continue;
  }

  const email = sub.customer && typeof sub.customer === "object" ? sub.customer.email : null;
  if (!email || !email.endsWith("@test.local")) {
    console.log(`  ⚠ ${target.note}: 顧客が @test.local ではありません（${email ?? "不明"}）→ 安全のためスキップ`);
    skipped += 1;
    continue;
  }

  await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
  console.log(`  ✔ ${target.note}: 即時解約しました（${sub.id}）`);
  cancelled += 1;
}

console.log(`\n完了: 解約 ${cancelled} 件 / スキップ ${skipped} 件`);
if (cancelled + skipped === TARGET_SUBSCRIPTIONS.length && skipped === 0) {
  console.log("✓ 4 件すべて解約できました。次は .env.local の 5 行差し替えです。");
}
