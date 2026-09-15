#!/usr/bin/env node
/**
 * A0（P11 価格改定）の Stripe 側セットアップを 1 コマンドで行う。
 *
 *   node scripts/stripe/setup-monthly-prices.mjs
 *
 * やること（すべて冪等。何度実行しても同じ結果になる）:
 *   1. 既存の月額 Price 4 本 + 初回事務手数料 Price から商品（Product）を特定し、
 *      新金額（2,800 / 9,800 / 28,000 / 168,000 円・月、事務手数料 12,000 円・一回限り）の
 *      Price を同じ商品に作る（Stripe の Price は金額変更不可のため新規作成。lookup_key で重複作成を防ぐ）
 *   2. 旧 Price をアーカイブ（active: false）する
 *   3. 旧 Price に紐づく契約（サブスクリプション）を一覧表示する
 *      —— 解約は自動では行わない。表示された契約を人間がダッシュボードで解約すること
 *      （環境変数差し替え後に旧 Price の更新通知が来ると「unknown price id」で失敗するため）
 *   4. .env.local / Vercel に貼る 5 行を表示する
 *
 * 必要な環境変数（.env.local から読む）:
 *   STRIPE_SECRET_KEY, STRIPE_PRICE_INDIVIDUAL, STRIPE_PRICE_SMALL,
 *   STRIPE_PRICE_CORPORATE, STRIPE_PRICE_CORPORATE_PREMIUM, STRIPE_PRICE_INITIAL_FEE
 *
 * 金額は src/lib/constants/plans.ts の PLAN_LIMITS / INITIAL_FEE_TAX_INCLUDED と
 * 一致させること（2026-09-10 クライアント決定値）。
 *
 * 注意: このスクリプトの後に年払い（scripts/stripe/setup-yearly-prices.mjs）を実行すること。
 * 年払いは .env.local の月額 Price ID から金額を導くため、先に .env.local を
 * 本スクリプトの出力で差し替えておく必要がある。
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
  // .env.local が無い場合は環境変数のみで動く（CI / 本番用）
}

// 新金額（税込円）。src/lib/constants/plans.ts と一致させること
const ITEMS = [
  { key: "INDIVIDUAL", label: "ライトプラン", amount: 2800, recurring: true, lookupKey: "bijiyu_individual_monthly_v2" },
  { key: "SMALL", label: "スタンダードプラン", amount: 9800, recurring: true, lookupKey: "bijiyu_small_monthly_v2" },
  { key: "CORPORATE", label: "プレミアムプラン", amount: 28000, recurring: true, lookupKey: "bijiyu_corporate_monthly_v2" },
  { key: "CORPORATE_PREMIUM", label: "ハイエンドプラン", amount: 168000, recurring: true, lookupKey: "bijiyu_corporate_premium_monthly_v2" },
  { key: "INITIAL_FEE", label: "初回事務手数料", amount: 12000, recurring: false, lookupKey: "bijiyu_initial_fee_v2" },
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

const newPriceIds = {};
const oldPricesToCheck = []; // { label, id } 契約一覧の確認対象

for (const item of ITEMS) {
  const envVar = `STRIPE_PRICE_${item.key}`;
  const currentPriceId = process.env[envVar];
  if (!currentPriceId || currentPriceId.includes("REPLACE_ME")) {
    fail(`${envVar}（現在の Price ID）が .env.local に設定されていません`);
  }

  const current = await stripe.prices.retrieve(currentPriceId);
  const productId = typeof current.product === "string" ? current.product : current.product.id;

  if (current.unit_amount === item.amount && current.active) {
    // すでに新金額の Price を指している（再実行時など）
    console.log(`  ✔ ${item.label}: ${envVar} はすでに新金額 ${item.amount.toLocaleString("ja-JP")}円（${currentPriceId}）`);
    newPriceIds[item.key] = currentPriceId;
    continue;
  }

  // 既存の新 Price（lookup_key で検索。再実行しても二重作成しない）
  const existing = await stripe.prices.list({ lookup_keys: [item.lookupKey], active: true, limit: 1 });
  let next = existing.data[0];

  if (next && next.unit_amount !== item.amount) {
    // lookup_key はあるが金額が違う（過去の試行の残り）→ 退避して作り直す
    console.log(`  ↻ ${item.label}: 既存の ${next.id} は金額違いのためアーカイブして作り直します`);
    await stripe.prices.update(next.id, { active: false, lookup_key: `${item.lookupKey}_old_${Date.now()}` });
    next = undefined;
  }

  if (!next) {
    next = await stripe.prices.create({
      product: productId,
      currency: "jpy",
      unit_amount: item.amount,
      ...(item.recurring ? { recurring: { interval: "month" } } : {}),
      lookup_key: item.lookupKey,
      nickname: `${item.label}（2026-09 改定）`,
      metadata: { plan_key: item.key.toLowerCase(), revision: "2026-09" },
    });
    console.log(
      `  ✔ ${item.label}: 新 Price を作成 ${next.id}（${item.amount.toLocaleString("ja-JP")}円${item.recurring ? "/月" : "・一回限り"}）`,
    );
  } else {
    console.log(`  ✔ ${item.label}: 新 Price は既存 ${next.id}（${next.unit_amount.toLocaleString("ja-JP")}円）`);
  }

  newPriceIds[item.key] = next.id;

  // 旧 Price をアーカイブ（ダッシュボードの一覧から非表示になる。既存契約が残っていても請求は継続する）
  if (current.active) {
    await stripe.prices.update(currentPriceId, { active: false });
    console.log(`    ・旧 Price ${currentPriceId}（${(current.unit_amount ?? 0).toLocaleString("ja-JP")}円）をアーカイブしました`);
  }
  if (item.recurring) {
    oldPricesToCheck.push({ label: item.label, id: currentPriceId });
  }
}

// ---------------------------------------------------------------------------
// 旧 Price に紐づく契約の一覧（解約は人間がダッシュボードで行う）
// ---------------------------------------------------------------------------
console.log("\n--- 旧 Price に紐づく契約（要確認） ---");
let foundAny = false;
for (const old of oldPricesToCheck) {
  const subs = await stripe.subscriptions.list({
    price: old.id,
    status: "all",
    limit: 100,
    expand: ["data.customer"],
  });
  const live = subs.data.filter((s) => !["canceled", "incomplete_expired"].includes(s.status));
  for (const s of live) {
    foundAny = true;
    const customer = s.customer && typeof s.customer === "object" ? s.customer : null;
    const who = customer ? (customer.email ?? customer.id) : String(s.customer);
    console.log(`  ⚠ ${old.label}: ${s.id}（status=${s.status}, customer=${who}）`);
  }
}
if (!foundAny) {
  console.log("  ✔ 旧 Price に紐づく有効な契約はありません（解約作業は不要）");
} else {
  console.log(
    "\n  ⚠ 上記の契約が残ったまま環境変数を差し替えると、更新通知が「unknown price id」で失敗します。",
  );
  console.log("    Stripe ダッシュボード → 顧客 → 該当サブスクリプションを解約してください（staging のテスト契約のみ）。");
}

// ---------------------------------------------------------------------------
// .env.local / Vercel に貼る行
// ---------------------------------------------------------------------------
console.log(`
==============================================================
以下の 5 行を .env.local と Vercel（staging）の環境変数に貼ってください
（既存の同名変数を上書き。貼り替え後に年払いスクリプトを実行すること）
==============================================================
STRIPE_PRICE_INDIVIDUAL=${newPriceIds.INDIVIDUAL}
STRIPE_PRICE_SMALL=${newPriceIds.SMALL}
STRIPE_PRICE_CORPORATE=${newPriceIds.CORPORATE}
STRIPE_PRICE_CORPORATE_PREMIUM=${newPriceIds.CORPORATE_PREMIUM}
STRIPE_PRICE_INITIAL_FEE=${newPriceIds.INITIAL_FEE}
==============================================================

次の手順:
  1. 上の 5 行で .env.local を差し替える
  2. node --env-file=.env.local scripts/cp1-verify-stripe.mjs で金額を確認する
  3. node scripts/stripe/setup-yearly-prices.mjs で年払い Price を作る（A1）
`);
