/**
 * Cookieless な公開読取専用 Supabase クライアント。
 *
 * `unstable_cache` の内部で安全に呼べるよう、`cookies()` / `headers()` /
 * `auth.getUser()` 等のリクエスト依存 API を一切使わない最小実装。
 * `@supabase/ssr` の `createServerClient` は使わない（cookies 依存で
 * unstable_cache 内ランタイム throw を引き起こす）。
 *
 * 用途は `src/lib/master/fetch.ts` のマスタ取得のみ。
 * 他から呼ぶと書き込み権限のないクライアントで意図しないエラーを招くため、
 * 原則として呼び出さないこと。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAnonClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is not set",
    );
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
