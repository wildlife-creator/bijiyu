#!/usr/bin/env node
/**
 * パスワード入力欄の👁トグル動作確認用に、
 *   - /reset-password/confirm （recovery）
 *   - /accept-invite/confirm  （invite）
 * の magic link をローカル Supabase Admin API から直接生成して標準出力に出す。
 *
 * 使い方:
 *   node scripts/generate-test-magic-links.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function genRecovery() {
  const email = "contractor@test.local";
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${APP_URL}/reset-password/confirm` },
  });
  if (error) throw new Error(`recovery: ${error.message}`);
  return { email, link: data.properties.action_link };
}

async function genInvite() {
  const stamp = Math.floor(Math.random() * 1e9).toString(36);
  const email = `invite-test+${stamp}@test.local`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${APP_URL}/accept-invite/confirm` },
  });
  if (error) throw new Error(`invite: ${error.message}`);
  return { email, link: data.properties.action_link };
}

const recovery = await genRecovery();
const invite = await genInvite();

console.log("");
console.log("========== パスワード再設定（/reset-password/confirm） ==========");
console.log(`対象: ${recovery.email}`);
console.log("↓ このURLをブラウザに貼って開く");
console.log(recovery.link);
console.log("");
console.log("========== 招待承諾（/accept-invite/confirm） ==========");
console.log(`対象: ${invite.email}（テスト用に毎回新規生成）`);
console.log("↓ このURLをブラウザに貼って開く");
console.log(invite.link);
console.log("");
console.log("どちらも👁トグルでパスワードの表示/非表示を確認してください。");
console.log("確認したら閉じてOK（テストデータは次回 supabase db reset でリセット）");
