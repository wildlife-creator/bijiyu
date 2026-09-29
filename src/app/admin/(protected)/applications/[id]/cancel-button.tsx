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
import { Button } from "@/components/ui/button";
import { adminCancelApplicationAction } from "./actions";

interface CancelButtonProps {
  applicationId: string;
  /** "link" = 見出し横の文字リンク（既定）/ "button" = 期限切れ解消の枠で使う赤枠線のピル型ボタン */
  variant?: "link" | "button";
}

/**
 * ADM-014: 発注取消ボタン（確認ダイアログ付き）。
 * 表示条件（canAdminCancel）は親 RSC 側で判定済み。Server Action 内でも再評価される。
 */
export function CancelButton({ applicationId, variant = "link" }: CancelButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    startTransition(async () => {
      const result = await adminCancelApplicationAction(applicationId);
      if (result.success) {
        toast.success("発注を取り消しました");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "button" ? (
          <Button
            type="button"
            variant="outline"
            className="w-full max-w-xs rounded-full border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            発注を取り消す
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-auto p-0 text-body-sm font-medium text-destructive hover:bg-transparent hover:text-destructive/80 hover:underline"
          >
            発注を取り消す
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>発注を取り消しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            この応募のステータスが「運営によるキャンセル」になります。通知メールは送信されないため、必要に応じて当事者へ個別に連絡してください。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={isPending}
            onClick={handleCancel}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? "処理中..." : "取り消す"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
