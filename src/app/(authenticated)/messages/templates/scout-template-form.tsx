"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/shared/back-button";
import {
  scoutTemplateSchema,
  type ScoutTemplateInput,
} from "@/lib/validations/message";

import {
  createScoutTemplateAction,
  updateScoutTemplateAction,
} from "./actions";

interface Props {
  mode: "create" | "update";
  templateId?: string;
  initialValues?: ScoutTemplateInput;
}

type FormInput = z.input<typeof scoutTemplateSchema>;

export function ScoutTemplateForm({ mode, templateId, initialValues }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, formState } = useForm<
    FormInput,
    unknown,
    ScoutTemplateInput
  >({
    resolver: zodResolver(scoutTemplateSchema),
    defaultValues: {
      title: initialValues?.title ?? "",
      body: initialValues?.body ?? "",
      memo: initialValues?.memo ?? "",
    },
  });

  function onSubmit(values: ScoutTemplateInput) {
    startTransition(async () => {
      if (mode === "create") {
        const result = await createScoutTemplateAction(values);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("テンプレートを作成しました");
        router.push("/messages/templates");
        router.refresh();
        return;
      }

      if (!templateId) {
        toast.error("テンプレート ID が不正です");
        return;
      }
      const result = await updateScoutTemplateAction(templateId, values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("テンプレートを更新しました");
      router.push(`/messages/templates/${templateId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label
          htmlFor="title"
          className="text-body-sm font-medium text-foreground"
        >
          タイトル
        </label>
        <input
          id="title"
          type="text"
          {...register("title")}
          className="mt-1 w-full rounded-[8px] border border-border bg-background px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isPending}
        />
        {formState.errors.title && (
          <p className="mt-1 text-body-sm text-destructive">
            {formState.errors.title.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="body"
          className="text-body-sm font-medium text-foreground"
        >
          本文
        </label>
        <textarea
          id="body"
          rows={10}
          {...register("body")}
          className="mt-1 w-full rounded-[8px] border border-border bg-background px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isPending}
        />
        {formState.errors.body && (
          <p className="mt-1 text-body-sm text-destructive">
            {formState.errors.body.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="memo"
          className="text-body-sm font-medium text-foreground"
        >
          メモ
        </label>
        <textarea
          id="memo"
          rows={4}
          {...register("memo")}
          className="mt-1 w-full rounded-[8px] border border-border bg-background px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isPending}
        />
        {formState.errors.memo && (
          <p className="mt-1 text-body-sm text-destructive">
            {formState.errors.memo.message}
          </p>
        )}
        <p className="mt-2 text-body-xs text-muted-foreground">
          ※メモはユーザーに共有されません。ご自身でご自由にお使いください
        </p>
      </div>

      {/* ボタン: 保存 + もどる（中央揃え） */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <Button
          type="submit"
          size="lg"
          className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          disabled={isPending}
        >
          保存する
        </Button>
        {mode === "update" && templateId ? (
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full max-w-xs rounded-pill border-secondary text-secondary"
          >
            <Link href={`/messages/templates/${templateId}`}>もどる</Link>
          </Button>
        ) : (
          <BackButton className="w-full max-w-xs" />
        )}
      </div>
    </form>
  );
}
