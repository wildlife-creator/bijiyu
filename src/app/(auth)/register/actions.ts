"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { signupEmailSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";
import type { Database } from "@/types/database";

/**
 * AUTH-001 サインアップは implicit flow を使う。
 *
 * 設計判断（2026-05-20 Phase 9 で実装）:
 * - PKCE flow（@supabase/ssr のデフォルト）だと code_verifier cookie が
 *   Server Action 経由でブラウザに伝播せず、/auth/callback での
 *   exchangeCodeForSession が必ず失敗する（Next.js 16 Turbopack の問題）
 * - 招待フロー（/accept-invite/confirm）が既に implicit flow + フラグメント
 *   トークン方式で動作しているので、同じパターンに揃える
 * - emailRedirectTo は client ページの /register/verify を指し、そこで
 *   `#access_token=...&refresh_token=...` を読んで setSession する
 * - @supabase/ssr の createServerClient で flowType: 'implicit' を渡しても
 *   PKCE が使われたため、@supabase/supabase-js の createClient を直接使い
 *   明示的に implicit flow に強制する（session 永続化も不要）
 */
export async function signupAction(formData: FormData): Promise<ActionResult> {
  const raw = { email: formData.get("email") };

  const parsed = signupEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "正しいメールアドレスを入力してください" };
  }

  const { email } = parsed.data;

  // Stateless implicit-flow client（session 永続化なし）
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  // Generate a crypto-random temporary password (64+ chars)
  const tempPassword = crypto.randomUUID() + crypto.randomUUID();

  // emailRedirectTo はユーザーが今アクセスしている host に揃える
  // （localhost / 127.0.0.1 のクッキードメインずれ防止）
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const siteUrl = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");

  await supabase.auth.signUp({
    email,
    password: tempPassword,
    options: {
      emailRedirectTo: `${siteUrl}/register/verify`,
    },
  });

  // Always return success to prevent account enumeration
  return { success: true };
}
