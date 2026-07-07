"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { resetPasswordSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";
import type { Database } from "@/types/database";

/**
 * S2 fix: パスワードリセットは implicit flow を使う。
 *
 * 設計判断:
 * - PKCE flow（@supabase/ssr のデフォルト）だと code_verifier cookie が
 *   Server Action 経由でブラウザに伝播せず、`/auth/callback` での
 *   exchangeCodeForSession が必ず失敗する（Next.js 16 Turbopack の問題）。
 *   signupAction と同じパターンで implicit flow に切替。
 * - emailRedirectTo は `/auth/callback` ではなく直接 client ページ
 *   `/reset-password/confirm` を指す。confirm ページで
 *   `#access_token=...&refresh_token=...` を読んで setSession() し、
 *   その後 updatePasswordAction を実行する。
 * - @supabase/supabase-js の createClient を直接使い明示的に implicit flow を強制する
 *   （session 永続化も不要）。
 */
export async function resetPasswordAction(
  formData: unknown,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const siteUrl = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");

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

  // Always return success to prevent account enumeration
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/reset-password/confirm`,
  });

  return { success: true };
}
