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
import { adminCompleteApplicationAction } from "./actions";

interface CompleteButtonProps {
  applicationId: string;
}

/**
 * ADM-014: 期限切れの発注済み応募を「完了扱い」にするボタン（確認ダイアログ付き）。
 * 表示条件（canAdminResolveExpired）は親 RSC 側で判定済み。Server Action 内でも再評価される。
 */
export function CompleteButton({ applicationId }: CompleteButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      const result = await adminCompleteApplicationAction(applicationId);
      if (result.success) {
        toast.success("完了扱いにしました");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto p-0 text-body-sm font-medium text-primary hover:bg-transparent hover:text-primary/80 hover:underline"
        >
          完了扱いにする
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>この応募を完了扱いにしますか？</AlertDialogTitle>
          <AlertDialogDescription>
            評価・完了報告の入力期間を過ぎているため当事者は操作できません。ステータスが「取引完了」になり、当事者の退会ができるようになります（評価は登録されません）。稼働しなかった案件の場合は「発注を取り消す」を使ってください。通知メールは送信されないため、必要に応じて当事者へ個別に連絡してください。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={isPending}
            onClick={handleComplete}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {isPending ? "処理中..." : "完了扱いにする"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
