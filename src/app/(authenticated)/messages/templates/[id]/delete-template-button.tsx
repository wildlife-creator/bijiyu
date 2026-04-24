"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteScoutTemplateAction } from "../actions";

interface Props {
  templateId: string;
}

export function DeleteTemplateButton({ templateId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = window.confirm(
      "このテンプレートを削除します。よろしいですか？",
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteScoutTemplateAction(templateId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("テンプレートを削除しました");
      router.push("/messages/templates");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-pill border-destructive bg-background px-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={handleClick}
      disabled={isPending}
    >
      削除する
    </Button>
  );
}
