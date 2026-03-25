"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "@/lib/validations/auth";
import { updatePasswordAction } from "@/app/(auth)/reset-password/confirm/actions";

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  async function onSubmit(data: UpdatePasswordInput) {
    setServerError(null);
    const result = await updatePasswordAction(data);

    if (result.success) {
      router.push("/login?message=password_updated");
    } else {
      setServerError(result.error);
      if (result.error.includes("有効期限")) {
        setIsExpired(true);
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-10">
      <div className="w-full max-w-lg">
        <h1 className="text-heading-xl font-bold text-center text-primary">
          パスワード再設定
        </h1>

        <p className="mt-4 text-body-sm text-center text-muted-foreground">
          新しいパスワードをご入力ください
        </p>

        {serverError && (
          <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-center">
            <p className="text-body-sm text-destructive">{serverError}</p>
            {isExpired && (
              <Link
                href="/reset-password"
                className="mt-2 inline-block text-body-sm text-primary underline"
              >
                パスワード再設定を再申請する
              </Link>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              type="password"
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
            <Input
              id="confirmPassword"
              type="password"
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
            className="rounded-[47px] bg-secondary text-secondary-foreground h-12 w-full font-bold"
          >
            {isSubmitting ? "更新中..." : "ログイン"}
          </Button>
        </form>
      </div>
    </div>
  );
}
