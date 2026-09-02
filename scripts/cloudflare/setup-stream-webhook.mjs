#!/usr/bin/env node
/**
 * P4（動画基盤）の Cloudflare Stream Webhook を登録し、署名検証用 secret を表示する。
 *
 *   node scripts/cloudflare/setup-stream-webhook.mjs https://staging.bijiyuu.net/api/webhooks/cloudflare-stream
 *
 * やること（冪等。同じ URL で何度実行しても登録は 1 つ）:
 *   1. Cloudflare Stream の Webhook 通知先を指定 URL に設定する（PUT /stream/webhook）
 *   2. 戻ってきた secret を CLOUDFLARE_STREAM_WEBHOOK_SECRET として .env.local /
 *      Vercel 環境変数に貼るための 1 行を表示する
 *
 * 必要な環境変数（.env.local から読む）:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN（権限: Account > Stream > Edit）
 *
 * 注意: Cloudflare アカウントにつき Webhook 通知先は 1 つ。staging と本番で別アカウント
 * （または別途通知先を切り替える運用）にすること。secret は登録のたびに再発行される。
 */

import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env.local が無ければ環境変数だけで動く
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
const notificationUrl = process.argv[2];

if (!accountId || !apiToken) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_STREAM_API_TOKEN を .env.local に設定してください",
  );
  process.exit(1);
}
if (!notificationUrl || !/^https:\/\//.test(notificationUrl)) {
  console.error(
    "使い方: node scripts/cloudflare/setup-stream-webhook.mjs https://<ホスト>/api/webhooks/cloudflare-stream",
  );
  process.exit(1);
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notificationUrl }),
  },
);
const json = await res.json();
if (!res.ok || json.success === false) {
  console.error("Webhook の登録に失敗しました", JSON.stringify(json.errors ?? json, null, 2));
  process.exit(1);
}

console.log("Cloudflare Stream Webhook を登録しました");
console.log(`  通知先: ${json.result?.notificationUrl}`);
console.log("");
console.log("以下の 1 行を .env.local（staging / 本番は Vercel の環境変数）に貼ってください:");
console.log("");
console.log(`CLOUDFLARE_STREAM_WEBHOOK_SECRET=${json.result?.secret ?? ""}`);
