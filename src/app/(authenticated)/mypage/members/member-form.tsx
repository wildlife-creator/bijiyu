"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/shared/back-button";
import {
  memberCreateSchema,
  type MemberCreateInput,
  type MemberUpdateInput,
} from "@/lib/validations/member";

import { createMemberAction, updateMemberAction } from "./actions";

type OrgRole = "owner" | "admin" | "staff";

interface Props {
  mode: "create" | "update";
  targetUserId?: string;
  actorRole: OrgRole;
  isCorporate: boolean;
  // update モードのみ
  targetRole?: OrgRole;
  isSelfEdit?: boolean;
  initialValues?: {
    lastName: string;
    firstName: string;
    email: string;
    orgRole: "admin" | "staff";
    isProxyAccount: boolean;
  };
}

type FormValues = {
  lastName: string;
  firstName: string;
  email: string;
  orgRole: "admin" | "staff";
  isProxyAccount: boolean;
};

function RequiredBadge() {
  return (
    <span className="ml-2 text-body-xs font-bold text-destructive">必須</span>
  );
}

export function MemberForm({
  mode,
  targetUserId,
  actorRole,
  isCorporate,
  targetRole,
  isSelfEdit,
  initialValues,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"input" | "confirm">("input");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(memberCreateSchema),
    defaultValues: {
      lastName: initialValues?.lastName ?? "",
      firstName: initialValues?.firstName ?? "",
      email: initialValues?.email ?? "",
      orgRole: initialValues?.orgRole ?? "staff",
      isProxyAccount: initialValues?.isProxyAccount ?? false,
    },
  });

  const values = watch();

  // 権限欄の選択肢制限
  // Owner / Admin 自身の編集（対象=自分）: 権限欄 disabled
  // Admin が Staff を編集: 権限欄非表示（要件 REQ-ORG-009）
  // Owner が Admin / Staff 編集: admin / staff 両方選択可
  // CLI-025 新規: Owner → admin+staff、Admin → staff のみ
  const showRoleField =
    mode === "create"
      ? true
      : !isSelfEdit &&
        !(actorRole === "admin" && targetRole === "staff");

  const canSelectAdmin =
    mode === "create" ? actorRole === "owner" : actorRole === "owner";

  const canEditProxy =
    isCorporate &&
    (mode === "create"
      ? actorRole === "owner" || actorRole === "admin"
      : !isSelfEdit);

  async function submitForm(data: FormValues) {
    startTransition(async () => {
      if (mode === "create") {
        const input: MemberCreateInput = {
          lastName: data.lastName,
          firstName: data.firstName,
          email: data.email,
          orgRole: data.orgRole,
          isProxyAccount: data.isProxyAccount,
        };
        const result = await createMemberAction(input);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("担当者を招待しました。招待メールを送信しました");
        router.push("/mypage/members");
        router.refresh();
        return;
      }

      if (!targetUserId) {
        toast.error("対象 ID が不正です");
        return;
      }
      const input: MemberUpdateInput = {
        lastName: data.lastName,
        firstName: data.firstName,
        email: data.email,
        ...(showRoleField ? { orgRole: data.orgRole } : {}),
        ...(canEditProxy ? { isProxyAccount: data.isProxyAccount } : {}),
      };
      const result = await updateMemberAction(targetUserId, input);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isSelfEdit
          ? "プロフィールを更新しました"
          : "担当者情報を更新しました",
      );
      router.push(`/mypage/members/${targetUserId}`);
      router.refresh();
    });
  }

  function handlePrimaryClick() {
    if (step === "input") {
      // Zod 検証後、確認画面へ
      handleSubmit(() => setStep("confirm"))();
      return;
    }
    // confirm → 送信
    handleSubmit(submitForm)();
  }

  if (step === "confirm") {
    return (
      <div className="space-y-5">
        <ConfirmRow label="名前" value={`${values.lastName}　${values.firstName}`} />
        <ConfirmRow label="メールアドレス" value={values.email} />
        {showRoleField && (
          <ConfirmRow
            label="権限"
            value={values.orgRole === "admin" ? "管理者" : "担当者"}
          />
        )}
        {canEditProxy && (
          <ConfirmRow
            label="代理アカウント"
            value={values.isProxyAccount ? "あり" : "なし"}
          />
        )}
        <div className="flex flex-col items-center gap-3 pt-4">
          <Button
            type="button"
            size="lg"
            className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
            onClick={handlePrimaryClick}
            disabled={isPending}
          >
            {mode === "create" ? "送信する" : "保存する"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full max-w-xs rounded-pill"
            onClick={() => setStep("input")}
            disabled={isPending}
          >
            入力に戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handlePrimaryClick();
      }}
      className="space-y-5"
    >
      {mode === "update" && !isSelfEdit && (
        <div className="rounded-[8px] border border-primary/20 bg-primary/5 px-4 py-3 text-body-sm text-foreground">
          アカウントを別の担当者に引き継ぐ場合は、新規作成（担当者新規登録）と
          旧担当者の削除で対応してください。既存のアカウントに別人の名前・
          メールを上書きしないでください
        </div>
      )}

      {/* 名前（姓 + 名） */}
      <div className="space-y-2">
        <label className="flex items-center text-body-sm font-bold text-foreground">
          名前
          <RequiredBadge />
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="田中"
              className="bg-background"
              {...register("lastName")}
              disabled={isPending}
            />
            {errors.lastName && (
              <p className="mt-1 text-body-sm text-destructive">
                {errors.lastName.message}
              </p>
            )}
          </div>
          <div className="flex-1">
            <Input
              placeholder="一郎"
              className="bg-background"
              {...register("firstName")}
              disabled={isPending}
            />
            {errors.firstName && (
              <p className="mt-1 text-body-sm text-destructive">
                {errors.firstName.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* メールアドレス */}
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="flex items-center text-body-sm font-bold text-foreground"
        >
          メールアドレス
          <RequiredBadge />
        </label>
        <Input
          id="email"
          type="email"
          placeholder="test@example.com"
          className="bg-background"
          {...register("email")}
          disabled={isPending}
        />
        {errors.email && (
          <p className="text-body-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      {/* 権限 */}
      {showRoleField && (
        <div className="space-y-2">
          <label
            htmlFor="orgRole"
            className="flex items-center text-body-sm font-bold text-foreground"
          >
            権限
            <RequiredBadge />
          </label>
          <select
            id="orgRole"
            {...register("orgRole")}
            disabled={isPending || (mode === "update" && isSelfEdit)}
            className="w-full rounded-[8px] border border-border bg-background px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {canSelectAdmin && <option value="admin">管理者</option>}
            <option value="staff">担当者</option>
          </select>
        </div>
      )}

      {/* 代理アカウント */}
      {canEditProxy && (
        <label className="flex items-center gap-3">
          <Checkbox
            checked={values.isProxyAccount}
            onCheckedChange={(v) => setValue("isProxyAccount", v === true)}
            disabled={isPending}
          />
          <span className="text-body-md text-foreground">代理アカウント</span>
        </label>
      )}

      <div className="flex flex-col items-center gap-3 pt-4">
        <Button
          type="submit"
          size="lg"
          className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          disabled={isPending}
        >
          入力内容を確認する
        </Button>
        <BackButton className="w-full max-w-xs" />
      </div>
    </form>
  );
}

function ConfirmRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-border bg-background px-4 py-3">
      <p className="text-body-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-body-md text-foreground">{value}</p>
    </div>
  );
}
