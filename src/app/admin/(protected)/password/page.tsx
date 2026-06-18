"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  adminPasswordChangeSchema,
  type AdminPasswordChangeInput,
} from "@/lib/validations/auth";
import { changeAdminPasswordAction } from "@/app/admin/(protected)/password/actions";

/**
 * ADM-015: 管理者パスワード変更。
 * デザインカンプなし（admin 共通スタイルに合わせる）。
 * 成功時は遷移せずインラインで完了メッセージを表示する。
 */
export default function AdminPasswordPage() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdminPasswordChangeInput>({
    resolver: zodResolver(adminPasswordChangeSchema),
  });

  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (data: AdminPasswordChangeInput) => {
    const formData = new FormData();
    formData.append("currentPassword", data.currentPassword);
    formData.append("newPassword", data.newPassword);
    formData.append("confirmPassword", data.confirmPassword);
    startTransition(async () => {
      const result = await changeAdminPasswordAction(formData);
      if (result.success) {
        setMessage({ type: "success", text: "パスワードを変更しました" });
        reset();
      } else {
        setMessage({ type: "error", text: result.error ?? "変更に失敗しました" });
      }
    });
  };

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        パスワード変更
      </h1>

      {message && (
        <p
          className={`mt-4 text-center text-body-sm ${
            message.type === "success" ? "text-foreground" : "text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 space-y-5 rounded-lg border border-border bg-background p-5"
      >
        <div className="space-y-2">
          <Label htmlFor="currentPassword">現在のパスワード</Label>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p className="text-body-sm text-destructive">
              {errors.currentPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">新しいパスワード（8文字以上）</Label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            {...register("newPassword")}
          />
          {errors.newPassword && (
            <p className="text-body-sm text-destructive">
              {errors.newPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-body-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="default"
          disabled={isPending}
          className="h-12 w-full rounded-[47px] font-bold text-white"
        >
          {isPending ? "変更中..." : "変更する"}
        </Button>
      </form>
    </div>
  );
}
