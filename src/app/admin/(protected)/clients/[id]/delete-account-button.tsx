"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteClientAccountAction } from "./actions";

interface DeleteAccountButtonProps {
  userId: string;
  /** 法人（配下メンバーあり）の場合は連動削除の警告文を出す */
  hasOrganization: boolean;
}

/**
 * ADM-004: アカウント削除ボタン（確認ダイアログ付き）。
 * 進行中取引ガードで拒否された場合はエラー文言を toast でそのまま表示する。
 */
export function DeleteAccountButton({
  userId,
  hasOrganization,
}: DeleteAccountButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteClientAccountAction(userId);
      // 成功時は Server Action 内で redirect されるためここには戻らない
      if (result && !result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="text-body-md font-medium text-destructive underline underline-offset-2"
        >
          アカウントを削除する
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>アカウントを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {hasOrganization
              ? "管理責任者を削除すると、配下の組織管理者・担当者のアカウントもすべて削除されます。Stripe のサブスクリプションも解約されます。この操作は取り消せません。"
              : "アカウントを削除すると、Stripe のサブスクリプションも解約されます。この操作は取り消せません。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? "削除中..." : "削除する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
