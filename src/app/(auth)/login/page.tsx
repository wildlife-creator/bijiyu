"use client";

import { useActionState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { loginAction } from "@/app/(auth)/login/actions";
import type { ActionResult } from "@/lib/types/action-result";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const errorFromParams = searchParams.get("error");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const [state, formAction] = useActionState<
    ActionResult<{ redirectTo: string }> | null,
    FormData
  >(async (_prevState, formData) => {
    return loginAction(formData);
  }, null);

  const [isPending, startTransition] = useTransition();

  const onSubmit = (data: LoginInput) => {
    const formData = new FormData();
    formData.append("email", data.email);
    formData.append("password", data.password);
    startTransition(() => {
      formAction(formData);
    });
  };

  const displayError =
    errorFromParams ?? (state && !state.success ? state.error : null);

  return (
    <div className="space-y-6">
      <h1 className="text-center text-heading-xl font-bold text-primary">
        ログイン
      </h1>

      {displayError && (
        <p className="text-center text-body-sm text-destructive">
          {displayError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">
            メールアドレス
            <span className="text-body-sm text-destructive">必須</span>
          </Label>
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
          <Label htmlFor="password">
            パスワード
            <span className="text-body-sm text-destructive">必須</span>
          </Label>
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
          <Link href="/reset-password" className="text-primary underline">
            こちら
          </Link>
        </p>

        {/* Submit */}
        <Button
          type="submit"
          variant="secondary"
          disabled={isPending}
          className="h-12 w-full rounded-[47px] font-bold"
        >
          {isPending ? "ログイン中..." : "ログイン"}
        </Button>
      </form>

      {/* Register link */}
      <p className="text-center text-body-sm text-muted-foreground">
        新規登録は
        <Link href="/register" className="text-primary underline">
          こちら
        </Link>
      </p>
    </div>
  );
}
