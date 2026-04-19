"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteMemberAction } from "../actions";

interface Props {
  targetUserId: string;
}

export function DeleteMemberButton({ targetUserId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = window.confirm(
      "この担当者を削除します。よろしいですか？\n\nこの担当者が作成したテンプレートは管理責任者に引き継がれます",
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteMemberAction(targetUserId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("担当者を削除しました");
      router.push("/mypage/members");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="rounded-pill px-8"
      onClick={handleClick}
      disabled={isPending}
    >
      削除する
    </Button>
  );
}
