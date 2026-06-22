"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import { AdminGuestHeaderMenu } from "@/components/admin/admin-guest-header-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { adminLoginAction } from "@/app/admin/login/actions";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-001: 管理者ログイン。
 * ガード付きレイアウト（(protected)）の外に置く（開いた瞬間の redirect 防止）。
 * デザインカンプ: design-assets/screens/ADM-001.png
 * 上部のヘッダー（ロゴ + 未ログイン用ハンバーガー）は UI-header-logout-b.png に準拠。
 */
export default function AdminLoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    async (_prevState, formData) => {
      return adminLoginAction(formData);
    },
    null,
  );

  const [isPending, startTransition] = useTransition();

  const onSubmit = (data: LoginInput) => {
    const formData = new FormData();
    formData.append("email", data.email);
    formData.append("password", data.password);
    startTransition(() => {
      formAction(formData);
    });
  };

  const displayError = state && !state.success ? state.error : null;

  return (
    <div className="flex min-h-dvh flex-col bg-muted">
      <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
        <Link href="/admin/login" className="flex items-center">
          {/* 静的ロゴのため next/image ではなく site-header と同じ <img> を使う */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-horizontal.png"
            alt="ビジ友 管理画面"
            width={100}
            height={32}
          />
        </Link>
        <AdminGuestHeaderMenu />
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-md space-y-6 rounded-lg bg-background p-6">
          <h1 className="text-center text-heading-xl font-bold text-secondary">
            管理者ログイン
          </h1>

          {displayError && (
            <p className="text-center text-body-sm text-destructive">
              {displayError}
            </p>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="sample@sample.com"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-body-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-body-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Forgot password link */}
            <p className="text-body-sm text-muted-foreground">
              パスワードを忘れた方は
              <Link href="/reset-password" className="text-secondary underline">
                こちら
              </Link>
            </p>

            {/* Submit */}
            <Button
              type="submit"
              variant="default"
              disabled={isPending}
              className="h-12 w-full rounded-[47px] font-bold text-white"
            >
              {isPending ? "ログイン中..." : "ログイン"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
