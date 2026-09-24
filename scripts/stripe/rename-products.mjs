#!/usr/bin/env node
/**
 * Stripe の商品名を、会員に見える日本語の表示名に揃える。
 *
 * Stripe の確認画面（Customer Portal のプラン変更・Checkout）には商品名がそのまま出る。
 * 初期の商品は `bijiyu_plan_corporate` のような内部名で作られており、会員にそのまま
 * 見えていた（2026-09-24 支払い E2E で確認）。このスクリプトは `.env.local` の
 * `STRIPE_PRICE_*` から商品を辿り、名前だけを更新する（Price・金額・ID は変えない）。
 *
 * 使い方（対象環境の STRIPE_SECRET_KEY が入った .env.local で、人間のターミナルから）:
 *   node scripts/stripe/rename-products.mjs           # 変更内容を表示するだけ
 *   node scripts/stripe/rename-products.mjs --apply   # 実際に更新
 *
 * ステージング・本番の Stripe アカウントごとに 1 回ずつ実行する。
 */
import Stripe from "stripe";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key) { console.error("STRIPE_SECRET_KEY がありません"); process.exit(1); }
const stripe = new Stripe(key);
const apply = process.argv.includes("--apply");

// 表示名は src/lib/constants/plans.ts / src/lib/billing/options.ts と揃える
const NAMES = {
  STRIPE_PRICE_INDIVIDUAL: "ライトプラン",
  STRIPE_PRICE_SMALL: "スタンダードプラン",
  STRIPE_PRICE_CORPORATE: "プレミアムプラン",
  STRIPE_PRICE_CORPORATE_PREMIUM: "ハイエンドプラン",
  STRIPE_PRICE_INITIAL_FEE: "初回事務手数料",
  STRIPE_PRICE_URGENT: "急募オプション",
  STRIPE_PRICE_VIDEO: "プロフィール動画制作プラン",
  STRIPE_PRICE_VIDEO_SHOOTING: "ユーザー撮影動画制作プラン",
  STRIPE_PRICE_VIDEO_SNS: "ビジ友公式SNS動画制作プラン",
  STRIPE_PRICE_COMPENSATION_5000: "補償オプション（5,000円）",
  STRIPE_PRICE_COMPENSATION_9800: "補償オプション（9,800円）",
};

console.log(`モード: ${apply ? "更新する" : "確認のみ（--apply で更新）"}（${key.startsWith("sk_live_") ? "本番" : "テスト"}キー）\n`);
const done = new Set();
for (const [envName, name] of Object.entries(NAMES)) {
  // 年額 Price は月額と同じ商品を共有するため、月額側の env から商品を辿れば十分
  const priceId = process.env[envName];
  if (!priceId) { console.log(`- ${envName}: 環境変数なし（スキップ）`); continue; }
  const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
  const product = price.product;
  if (done.has(product.id)) continue;
  done.add(product.id);
  const current = product.name;
  if (current === name) { console.log(`= ${envName}: 「${name}」（変更なし）`); continue; }
  console.log(`${apply ? "✓" : "→"} ${envName}: 「${current}」→「${name}」`);
  if (apply) await stripe.products.update(product.id, { name });
}
