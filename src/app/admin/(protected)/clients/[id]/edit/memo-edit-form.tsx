"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateAdminMemoAction } from "../actions";

interface MemoEditFormProps {
  userId: string;
  initialMemo: string;
}

const MAX_LENGTH = 2000;

/** ADM-005: 管理者メモ編集フォーム（admin_memo 1項目のみ） */
export function MemoEditForm({ userId, initialMemo }: MemoEditFormProps) {
  const [memo, setMemo] = useState(initialMemo);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (memo.length > MAX_LENGTH) {
      toast.error(`メモは${MAX_LENGTH}文字以内で入力してください`);
      return;
    }
    const formData = new FormData();
    formData.set("adminMemo", memo);
    startTransition(async () => {
      const result = await updateAdminMemoAction(userId, formData);
      // 成功時は Server Action 内で ADM-004 へ redirect される
      if (result && !result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <label htmlFor="admin-memo" className="text-body-sm font-bold">
        管理者のメモ
      </label>
      <Textarea
        id="admin-memo"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={10}
        maxLength={MAX_LENGTH}
        className="mt-2 bg-background"
        placeholder="社内向けのメモを入力してください"
      />
      <p className="mt-1 text-right text-body-xs text-muted-foreground">
        {memo.length} / {MAX_LENGTH}
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          className="h-12 w-full max-w-xs rounded-full bg-primary font-bold text-white hover:bg-primary/90"
        >
          {isPending ? "保存中..." : "保存する"}
        </Button>
        <Button
          asChild
          type="button"
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={`/admin/clients/${userId}`}>もどる</Link>
        </Button>
      </div>
    </form>
  );
}
