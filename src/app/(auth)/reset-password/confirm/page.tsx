"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { EmailLandingCard } from "@/components/auth-landing/email-landing-card";
import { Label } from "@/components/ui/label";
import { LinkExpiredCard } from "@/components/auth/link-expired-card";
import { PasswordInput } from "@/components/ui/password-input";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "@/lib/validations/auth";
import { updatePasswordAction } from "@/app/(auth)/reset-password/confirm/actions";

/**
 * S2 fix: implicit flow のフラグメント経由でセッションを確立してから
 * パスワード更新フォームを表示する。
 *
 * signup と同じパターン (src/app/(auth)/register/verify/page.tsx 参照)。
 * PKCE / /auth/callback を経由しないため code_verifier cookie 問題の影響を受けない。
 */
export default function ResetPasswordConfirmPage() {
  const [isReady, setIsReady] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  // セッション確立 (hash からトークン読み取り → setSession)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function establishSession() {
      const hash = window.location.hash;

      // hash 無し = 直接アクセス or 二重確立試行。既にセッションがあるなら form を出す。
      if (!hash) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          setIsReady(true);
        } else {
          setIsExpired(true);
        }
        return;
      }

      const params = new URLSearchParams(hash.slice(1));
      const errorCode = params.get("error_code");
      if (errorCode) {
        // otp_expired / invalid など
        setIsExpired(true);
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setIsExpired(true);
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setIsExpired(true);
        return;
      }

      // 再読み込み時の再処理防止のため URL から hash を除去
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      setIsReady(true);
    }

    void establishSession();
  }, []);

  async function onSubmit(data: UpdatePasswordInput) {
    setServerError(null);
    const result = await updatePasswordAction(data);

    if (result.success) {
      // S2: サーバー側で signOut 済み。Router Cache 回避のためハードナビゲーション。
      window.location.href =
        result.data?.redirectTo ?? "/login?message=password_updated";
    } else {
      setServerError(result.error);
      if (result.error.includes("有効期限")) {
        setIsExpired(true);
      }
    }
  }

  if (isExpired) {
    return (
      <EmailLandingCard>
        <LinkExpiredCard actionText="お手数ですが、もう一度パスワード再設定をお申し込みください。" />
      </EmailLandingCard>
    );
  }

  if (!isReady) {
    return (
      <EmailLandingCard>
        <p className="text-center text-body-sm text-muted-foreground">
          認証情報を確認しています...
        </p>
      </EmailLandingCard>
    );
  }

  return (
    <EmailLandingCard>
      <h1 className="text-heading-xl font-bold text-center text-secondary">
        パスワード再設定
      </h1>

      <p className="mt-4 text-body-sm text-center text-muted-foreground">
        新しいパスワードをご入力ください
      </p>

      {serverError && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-center">
          <p className="text-body-sm text-destructive">{serverError}</p>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">パスワード</Label>
          <PasswordInput
            id="password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <p className="text-body-xs text-muted-foreground">
            ※ 半角英数字の組み合わせ、8〜16文字
          </p>
          {errors.password && (
            <p className="text-body-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">パスワード（確認）</Label>
          <PasswordInput
            id="confirmPassword"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          <p className="text-body-xs text-muted-foreground">
            ※ 半角英数字の組み合わせ、8〜16文字
          </p>
          {errors.confirmPassword && (
            <p className="text-body-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-[47px] bg-primary text-primary-foreground h-12 w-full font-bold"
        >
          {isSubmitting ? "更新中..." : "ログイン"}
        </Button>
      </form>
    </EmailLandingCard>
  );
}
