#!/usr/bin/env node
/**
 * A3〜A4（Cloudflare Stream）の設定値を検証する。秘密の値は一切表示しない。
 *
 *   node scripts/cloudflare/verify-stream.mjs
 *
 * 確認すること:
 *   1. .env.local に CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_API_TOKEN があるか（値は表示しない）
 *   2. その組み合わせで Cloudflare Stream API に接続できるか（トークンの有効性）
 *   3. Webhook（通知 URL）が登録されているか、URL がどこを向いているか
 */

import { readFileSync } from "node:fs";

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

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;

let ok = true;

if (!accountId) {
  console.log("✖ CLOUDFLARE_ACCOUNT_ID が .env.local にありません");
  ok = false;
} else {
  console.log(`✔ CLOUDFLARE_ACCOUNT_ID: 設定あり（${accountId}）`);
}
if (!token) {
  console.log("✖ CLOUDFLARE_STREAM_API_TOKEN が .env.local にありません");
  ok = false;
} else {
  console.log(`✔ CLOUDFLARE_STREAM_API_TOKEN: 設定あり（値は表示しません。長さ ${token.length} 文字）`);
}
if (!ok) process.exit(1);

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const headers = { Authorization: `Bearer ${token}` };

// 1. トークンの有効性（動画一覧の取得を試す）
const listRes = await fetch(`${base}/stream?per_page=5`, { headers });
const listJson = await listRes.json().catch(() => null);
if (listRes.ok && listJson?.success) {
  console.log(`✔ Stream API に接続できました（現在の動画: ${listJson.result?.length ?? 0} 本）`);
} else {
  const errs = listJson?.errors?.map((e) => `${e.code}: ${e.message}`).join(" / ") ?? `HTTP ${listRes.status}`;
  console.log(`✖ Stream API に接続できません（${errs}）`);
  console.log("  → トークンの貼り間違い・権限不足（Stream Edit が必要）・Account ID の誤りが典型的な原因です");
  process.exit(1);
}

// 2. Webhook（通知 URL）の登録確認
const whRes = await fetch(`${base}/stream/webhook`, { headers });
const whJson = await whRes.json().catch(() => null);
if (whRes.ok && whJson?.success && whJson.result?.notificationUrl) {
  const url = whJson.result.notificationUrl;
  console.log(`✔ Webhook 登録あり: ${url}`);
  if (url === "https://staging.bijiyuu.net/api/webhooks/cloudflare-stream") {
    console.log("✔ 通知 URL はステージングの正しい宛先です");
  } else {
    console.log("⚠ 通知 URL がチェックリストの想定と異なります（staging-release-checklist A4 を参照）");
  }
} else if (whRes.status === 404) {
  console.log("✖ Webhook が未登録です（A4 の setup-stream-webhook.mjs を実行してください）");
  process.exit(1);
} else {
  const errs = whJson?.errors?.map((e) => `${e.code}: ${e.message}`).join(" / ") ?? `HTTP ${whRes.status}`;
  console.log(`⚠ Webhook の確認に失敗しました（${errs}）`);
}

console.log("\n✓ Cloudflare の設定確認が完了しました");
