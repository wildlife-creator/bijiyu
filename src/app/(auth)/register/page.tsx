"use client";

import { useActionState, startTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { BackChevron } from "@/components/shared/back-chevron";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signupEmailSchema,
  type SignupEmailInput,
} from "@/lib/validations/auth";
import { signupAction } from "@/app/(auth)/register/actions";
import type { ActionResult } from "@/lib/types/action-result";

export default function RegisterPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupEmailInput>({
    resolver: zodResolver(signupEmailSchema),
  });

  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_prevState, formData) => {
    return signupAction(formData);
  }, null);

  const onSubmit = (data: SignupEmailInput) => {
    const formData = new FormData();
    formData.append("email", data.email);
    // useActionState の formAction は transition 内で呼ぶ必要がある。
    // transition 外で呼ぶと Server Action の Set-Cookie がブラウザに反映されず
    // PKCE 用 code_verifier が永続化されない（AUTH-001 で実例発生）。
    startTransition(() => {
      formAction(formData);
    });
  };

  const isSuccess = state?.success === true;
  const errorMessage = state && !state.success ? state.error : null;

  if (isSuccess) {
    return (
      <div className="space-y-6">
        <h1 className="text-center text-heading-xl font-bold text-secondary">
          会員登録メール認証
        </h1>
        <p className="text-center text-body-base text-foreground">
          ご入力いただいたメールアドレスに会員登録のためのURLをお送りしました。
          メールをご確認ください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackChevron />
      <h1 className="text-center text-heading-xl font-bold text-secondary">
        会員登録メール認証
      </h1>

      <p className="text-center text-body-base text-muted-foreground">
        ご入力いただいたメールアドレスに会員登録のためのURLをお送りします
      </p>

      {errorMessage && (
        <p className="text-center text-body-sm text-destructive">
          {errorMessage}
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

        {/* Terms note */}
        <p className="text-body-sm text-muted-foreground">
          利用規約、プライバシーポリシーに同意の上ご登録ください
        </p>

        {/* Submit */}
        <Button
          type="submit"
          variant="default"
          disabled={isPending}
          className="h-12 w-full rounded-[47px] font-bold"
        >
          {isPending ? "送信中..." : "同意して送信する"}
        </Button>
      </form>
    </div>
  );
}
