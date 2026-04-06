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
}

export function CancelButton({ applicationId }: CancelButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            {isLoading ? "キャンセル中..." : "キャンセルする"}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>応募をキャンセルしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。応募をキャンセルしてもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>いいえ</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={isLoading}>
              キャンセルする
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-body-sm text-destructive">{error}</p>}
    </div>
  );
}
