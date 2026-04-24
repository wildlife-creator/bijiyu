"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resendInviteAction } from "../actions";

interface Props {
  targetUserId: string;
}

export function ResendInviteButton({ targetUserId }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await resendInviteAction(targetUserId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("招待メールを再送しました");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full max-w-xs rounded-pill border-primary bg-background text-primary hover:bg-primary/10 hover:text-primary"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "送信中..." : "招待を再送する"}
    </Button>
  );
}
