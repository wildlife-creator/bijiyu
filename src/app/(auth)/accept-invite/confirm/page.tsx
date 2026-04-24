"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@supabase/ssr";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "@/lib/validations/auth";
import { acceptInviteAction } from "./actions";

/**
 * AUTH-008 招待承諾画面（AUTH-004 をベース、5 箇所差し替え）
 *
 * - タイトル:「ビジ友へようこそ」
 * - 説明文: パスワード初回設定の案内
 * - ボタン: 「パスワードを設定する」
 * - 成功遷移: /mypage
 * - 期限切れ文言: 「リンクの有効期限が切れています。招待元に再送を依頼してください」
 */
export default function AcceptInviteConfirmPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  // 招待リンク（implicit flow）で URL フラグメントに載ってくる access_token /
  // refresh_token を明示的に受け取り、setSession で session を Cookie に書き込む。
  // これを待ってから isReady=true にすることで、Server Action の getUser() が
  // Cookie 未書き込みのまま呼ばれて「有効期限切れ」扱いになるのを防ぐ。
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function hydrate() {
      // URL フラグメントからトークンを抽出（#access_token=...&refresh_token=...）
      if (typeof window !== "undefined" && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setIsExpired(true);
            setServerError(
              "リンクの有効期限が切れています。招待元に再送を依頼してください",
            );
            setIsReady(true);
            return;
          }
          // フラグメントを URL から除去（見た目を綺麗にする）
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsReady(true);
        return;
      }
      const { data: publicUser } = await supabase
        .from("users")
        .select("password_set_at")
        .eq("id", user.id)
        .maybeSingle();
      if (publicUser?.password_set_at) {
        router.replace("/mypage");
        return;
      }
      setIsReady(true);
    }

    hydrate();
  }, [router]);

  async function onSubmit(data: UpdatePasswordInput) {
    setServerError(null);
    const result = await acceptInviteAction(data);

    if (result.success) {
      router.push(result.data?.redirectTo ?? "/mypage");
      router.refresh();
    } else {
      setServerError(result.error);
      if (result.error.includes("有効期限")) {
        setIsExpired(true);
      }
    }
  }

  if (!isReady) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-10">
      <div className="w-full max-w-lg">
        <h1 className="text-heading-xl font-bold text-center text-secondary">
          ビジ友へようこそ
        </h1>

        <p className="mt-4 text-body-sm text-center text-muted-foreground">
          ご利用開始にあたり、パスワードをご設定ください
        </p>

        {serverError && (
          <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-center">
            <p className="text-body-sm text-destructive">{serverError}</p>
            {isExpired && (
              <Link
                href="/login"
                className="mt-2 inline-block text-body-sm text-secondary underline"
              >
                ログイン画面へ戻る
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
            className="rounded-[47px] bg-primary text-primary-foreground h-12 w-full font-bold"
          >
            {isSubmitting ? "設定中..." : "パスワードを設定する"}
          </Button>
        </form>
      </div>
    </div>
  );
}
