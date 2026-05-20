"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * AUTH-001 メール認証コールバック (implicit flow)
 *
 * signupAction の emailRedirectTo がここを指す。Supabase Auth が
 * `#access_token=...&refresh_token=...` 形式のフラグメントでトークンを
 * 渡すので、client 側で setSession して /register/profile に遷移する。
 *
 * /accept-invite/confirm と同じパターン。PKCE を使わない理由は
 * src/app/(auth)/register/actions.ts の冒頭コメント参照。
 */
export default function VerifySignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function verify() {
      if (!window.location.hash) {
        setError(
          "認証情報が見つかりません。リンクが正しくない可能性があります。",
        );
        return;
      }

      const params = new URLSearchParams(window.location.hash.slice(1));
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        setError(errorDescription);
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError(
          "認証情報が不完全です。リンクの有効期限が切れている可能性があります。",
        );
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        setError("セッションの確立に失敗しました。もう一度お試しください。");
        return;
      }

      // フラグメントを URL から除去（リロード時の再処理防止）
      window.history.replaceState(null, "", window.location.pathname);
      router.replace("/register/profile");
    }

    verify();
  }, [router]);

  return (
    <div className="space-y-6 text-center">
      <h1 className="text-heading-xl font-bold text-secondary">
        メール認証中...
      </h1>
      {error ? (
        <p className="text-body-base text-destructive">{error}</p>
      ) : (
        <p className="text-body-base text-muted-foreground">
          認証情報を確認しています。少々お待ちください。
        </p>
      )}
    </div>
  );
}
