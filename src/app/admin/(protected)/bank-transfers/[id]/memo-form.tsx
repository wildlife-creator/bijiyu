"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { updateBankTransferMemoAction } from "../actions";

interface BankTransferMemoFormProps {
  requestId: string;
  initialMemo: string;
}

/** ADM-026 の運営メモ（請求書番号・入金日・連絡履歴などを自由記述）。 */
export function BankTransferMemoForm({ requestId, initialMemo }: BankTransferMemoFormProps) {
  const router = useRouter();
  const [memo, setMemo] = useState(initialMemo);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("memo", memo);
    startTransition(async () => {
      const result = await updateBankTransferMemoAction(requestId, fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("メモを保存しました");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      <Textarea
        name="memo"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="請求書番号・入金日・連絡履歴など"
        className="bg-background"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="outline"
          className="rounded-full"
          disabled={isPending || memo === initialMemo}
          pending={isPending}
        >
          メモを保存する
        </Button>
      </div>
    </form>
  );
}
