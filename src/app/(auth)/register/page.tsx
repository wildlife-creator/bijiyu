"use client";

import { useActionState, startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

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

  // 送信完了画面で「再送」に使うため、直近に送信したメールアドレスを保持する。
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [resendState, setResendState] = useState<{
    pending: boolean;
    message: string;
    ok: boolean;
  }>({ pending: false, message: "", ok: false });

  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_prevState, formData) => {
    return signupAction(formData);
  }, null);

  const onSubmit = (data: SignupEmailInput) => {
    setSubmittedEmail(data.email);
    setResendState({ pending: false, message: "", ok: false });
    const formData = new FormData();
    formData.append("email", data.email);
    // useActionState の formAction は transition 内で呼ぶ必要がある。
    // transition 外で呼ぶと Server Action の Set-Cookie がブラウザに反映されず
    // PKCE 用 code_verifier が永続化されない（AUTH-001 で実例発生）。
    startTransition(() => {
      formAction(formData);
    });
  };

  // 送信完了画面からの再送。useActionState を経由すると success 画面が
  // 一旦フォームへ戻ってしまうため、Server Action を直接呼んで inline に
  // フィードバックを出す。
  const onResend = async () => {
    if (!submittedEmail || resendState.pending) return;
    setResendState({ pending: true, message: "", ok: false });
    const formData = new FormData();
    formData.append("email", submittedEmail);
    const result = await signupAction(formData);
    if (result.success) {
      setResendState({
        pending: false,
        ok: true,
        message: "確認メールを再送しました。メールをご確認ください。",
      });
    } else {
      setResendState({ pending: false, ok: false, message: result.error });
    }
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

        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <p className="text-body-sm text-muted-foreground">
            メールが届かない場合は、迷惑メールフォルダをご確認ください。
            それでも届かない場合は、下のボタンから再送するか、しばらく時間をおいてお試しください。
          </p>
          <p className="text-body-sm text-muted-foreground">
            すでに会員登録がお済みのメールアドレスの場合は、確認メールは送信されません。
            ログイン、またはパスワードをお忘れの場合は再設定をご利用ください。
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onResend}
            disabled={resendState.pending}
            className="h-12 w-full rounded-[47px] font-bold"
          >
            {resendState.pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                送信中...
              </>
            ) : (
              "確認メールを再送する"
            )}
          </Button>
          {resendState.message && (
            <p
              className={
                resendState.ok
                  ? "text-center text-body-sm text-foreground"
                  : "text-center text-body-sm text-destructive"
              }
            >
              {resendState.message}
            </p>
          )}
        </div>
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
