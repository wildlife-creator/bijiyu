"use client";

import { useRouter } from "next/navigation";
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

import { setOpsAccountAction, unsetOpsAccountAction } from "./ops-account-actions";

interface OpsAccountPanelProps {
  userId: string;
  isHidden: boolean;
  /** 現在の契約の表示（例: 「ハイエンドプラン（銀行振込）」）。無ければ null */
  currentPlanLabel: string | null;
}

/**
 * ADM-009: 管理運営アカウントの設定 / 解除パネル（P5）。
 * 設定は確認ダイアログ付き（非表示 + ハイエンド相当の手動サブスク付与を 1 操作で行う）。
 */
export function OpsAccountPanel({
  userId,
  isHidden,
  currentPlanLabel,
}: OpsAccountPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSet() {
    startTransition(async () => {
      const result = await setOpsAccountAction(userId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("管理運営アカウントに設定しました");
      router.refresh();
    });
  }

  function handleUnset() {
    startTransition(async () => {
      const result = await unsetOpsAccountAction(userId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("管理運営アカウントを解除しました");
      router.refresh();
    });
  }

  return (
    <div className="rounded-[8px] border border-border/10 bg-background p-4">
      <p className="text-body-sm text-foreground">
        現在の状態:{" "}
        <span className="font-bold">
          {isHidden ? "管理運営アカウント（一覧・検索に表示しない）" : "通常の会員"}
        </span>
      </p>
      <p className="mt-1 text-body-sm text-muted-foreground">
        契約: {currentPlanLabel ?? "なし"}
      </p>
      <p className="mt-3 text-body-xs text-muted-foreground">
        管理運営アカウントは、運営が職人を発注者へ提案したり、案件を職人へ提案したりするために使う会員です。
        設定すると、職人一覧・発注者一覧・検索・マイリスト・スカウト対象から除外され、ハイエンドプラン相当の契約（銀行振込扱い・有効期限
        2099 年・支払いなし）が付与されます。契約の解約は発注者詳細の「銀行振込」欄から行います。
      </p>

      <div className="mt-4 flex justify-end">
        {isHidden ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                className="rounded-full"
              >
                管理運営アカウントを解除する
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>管理運営アカウントを解除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  一覧・検索に表示されるようになります。契約はそのまま残ります（解約は発注者詳細の「銀行振込」欄から）。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnset}>解除する</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                disabled={isPending}
                className="rounded-full bg-primary text-white hover:bg-primary/90"
              >
                管理運営アカウントに設定する
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>管理運営アカウントに設定しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  このユーザーを一覧・検索から除外し、ハイエンドプラン相当の契約（支払いなし・有効期限
                  2099 年）を付与します。受注者の場合は発注者に昇格し、組織が作成されます。有効化メールは送信しません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleSet}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  設定する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
