"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { adminLoginAction } from "@/app/admin/login/actions";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-001: 管理者ログイン。
 * ガード付きレイアウト（(protected)）の外に置く（開いた瞬間の redirect 防止）。
 * デザインカンプ: design-assets/screens/ADM-001.png
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
    <div className="flex min-h-dvh items-center justify-center bg-muted px-5 py-8">
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
            <Input
              id="password"
              type="password"
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
  );
}
