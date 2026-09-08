"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { cancelApplicationAction } from "@/app/(authenticated)/applications/actions";

interface CancelButtonProps {
  applicationId: string;
  /**
   * accepted = 発注後キャンセル（従来。初回稼働日 5 日前まで）
   * applied  = 結果待ちの応募を取り下げる（2026-09-08 追加。FAQ「マッチング成立前であれば
   *            応募の取り下げは可能」と整合。日付制限なし）
   */
  mode?: "accepted" | "applied";
}

const LABELS = {
  accepted: {
    trigger: "キャンセルする",
    pending: "キャンセル中...",
    title: "応募をキャンセルしますか？",
    description: "この操作は取り消せません。応募をキャンセルしてもよろしいですか？",
    confirm: "キャンセルする",
  },
  applied: {
    trigger: "応募を取り下げる",
    pending: "取り下げ中...",
    title: "応募を取り下げますか？",
    description:
      "発注者にはまだ結果が出ていない応募です。取り下げると発注者に通知され、この操作は取り消せません（同じ案件に改めて応募することはできます）。",
    confirm: "取り下げる",
  },
} as const;

export function CancelButton({ applicationId, mode = "accepted" }: CancelButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = LABELS[mode];

  async function handleCancel() {
    setIsLoading(true);
    setError(null);

    const result = await cancelApplicationAction(applicationId);

    if (result.success) {
      router.push("/applications/history");
    } else {
      setError(result.error);
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="w-full text-center text-body-sm text-muted-foreground underline"
            disabled={isLoading}
          >
            {isLoading ? labels.pending : labels.trigger}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.title}</AlertDialogTitle>
            <AlertDialogDescription>{labels.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>いいえ</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={isLoading}>
              {labels.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-body-sm text-destructive">{error}</p>}
    </div>
  );
}
