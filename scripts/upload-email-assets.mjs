#!/usr/bin/env node
/**
 * email-assets バケットに `public/images/logo-horizontal.png` をアップロード。
 *
 * 各環境（local / staging / production）ごとに一度だけ実行すればよい。
 * バケット自体は migration `20260705120000_email_assets_bucket.sql` で作成済みで、
 * このスクリプトは実ファイルを put するだけ。
 *
 * 使い方（例）:
 *   # ローカル (supabase start 済み)
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service_role key> \
 *     node scripts/upload-email-assets.mjs
 *
 *   # staging
 *   NEXT_PUBLIC_SUPABASE_URL=https://<staging-project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<staging service_role key> \
 *     node scripts/upload-email-assets.mjs
 *
 * 冪等: 同名オブジェクトが既にあれば上書き（upsert）する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です",
  );
  process.exit(1);
}

const BUCKET = "email-assets";
const OBJECT_PATH = "logo-horizontal.png";
const LOCAL_FILE = join(process.cwd(), "public", "images", "logo-horizontal.png");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const buffer = readFileSync(LOCAL_FILE);
console.log(`📤 uploading ${LOCAL_FILE} (${buffer.length} bytes) to ${SUPABASE_URL}/${BUCKET}/${OBJECT_PATH}`);

const { error } = await supabase.storage
  .from(BUCKET)
  .upload(OBJECT_PATH, buffer, {
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
    upsert: true,
  });

if (error) {
  console.error("❌ upload failed:", error);
  process.exit(1);
}

const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OBJECT_PATH}`;
console.log(`✅ uploaded. public URL: ${publicUrl}`);
