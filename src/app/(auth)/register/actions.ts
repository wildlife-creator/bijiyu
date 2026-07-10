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

  const { error } = await supabase.auth.signUp({
    email,
    password: tempPassword,
    options: {
      emailRedirectTo: `${siteUrl}/register/verify`,
    },
  });

  // レート制限（短時間の連続送信 / 1時間あたりの送信上限）に達した場合だけは
  // 正確な案内を返す。これは送信頻度に対するエラーであり、当該メールアドレスの
  // 登録有無を明かさないため account enumeration の懸念はない。
  // それ以外のエラー（既に確認済みユーザー等）は enumeration 防止のため
  // success に丸めて「送信しました」画面へ進める（送信完了画面の案内文で
  // 「既に登録済みの場合はログイン/パスワード再設定」を誘導する）。
  if (error && isRateLimitError(error.status, error.message)) {
    return {
      success: false,
      error:
        "確認メールの送信間隔が空いていません。しばらく時間をおいてから、もう一度お試しください。",
    };
  }

  // Always return success to prevent account enumeration
  return { success: true };
}

/**
 * Supabase Auth のメール送信レート制限エラーかを判定する。
 * GoTrue は HTTP 429 と "For security purposes..." / "rate limit" 系の
 * メッセージを返す。
 */
function isRateLimitError(
  status: number | undefined,
  message: string | undefined,
): boolean {
  if (status === 429) return true;
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("for security purposes") ||
    m.includes("only request this after")
  );
}
