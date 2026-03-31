"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validations/auth";
import { resetPasswordAction } from "@/app/(auth)/reset-password/actions";

export default function ResetPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(data: ResetPasswordInput) {
    const result = await resetPasswordAction(data);
    if (result.success) {
      setSent(true);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-10">
      <div className="w-full max-w-lg">
        <h1 className="text-heading-xl font-bold text-center text-secondary">
          パスワード再設定依頼
        </h1>

        {sent ? (
          <div className="mt-8 text-center">
            <p className="text-body-base text-foreground">
              リセットメールを送信しました
            </p>
            <p className="mt-2 text-body-sm text-muted-foreground">
              メールに記載されたURLからパスワードを再設定してください
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-body-sm text-center text-muted-foreground">
              ご入力いただいたメールアドレスにパスワード再設定のためのURLをお送りいたします
            </p>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-8 flex flex-col gap-6"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="sample@sample.com"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-body-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-[47px] bg-primary text-primary-foreground h-12 w-full font-bold"
              >
                {isSubmitting ? "送信中..." : "送信する"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
