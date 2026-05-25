"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/shared/back-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TROUBLE_CATEGORIES } from "@/lib/constants/trouble-options";
import { SUPPORT_ATTACHMENT_RULES } from "@/lib/support/attachments";
import {
  troubleReportSchema,
  type TroubleReportInput,
} from "@/lib/validations/trouble";
import { submitTroubleReportAction } from "./actions";

const REQUIRED_BADGE = (
  <span className="ml-1 text-body-sm text-destructive">必須</span>
);
const OPTIONAL_BADGE = (
  <span className="ml-1 text-body-sm text-muted-foreground">〔任意〕</span>
);
const ACCEPT_ATTR = "image/jpeg,image/png,application/pdf";

interface TroubleReportFormProps {
  defaultName: string;
  defaultEmail: string;
}

export function TroubleReportForm({
  defaultName,
  defaultEmail,
}: TroubleReportFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TroubleReportInput>({
    resolver: zodResolver(troubleReportSchema),
    defaultValues: {
      reporterName: defaultName,
      counterpartyName: "",
      email: defaultEmail,
      category: "",
      content: "",
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > SUPPORT_ATTACHMENT_RULES.maxFiles) {
      toast.error(
        `添付できるファイルは最大${SUPPORT_ATTACHMENT_RULES.maxFiles}件です`,
      );
      e.target.value = "";
      return;
    }
    for (const f of selected) {
      if (f.size > SUPPORT_ATTACHMENT_RULES.maxBytesPerFile) {
        toast.error("1ファイルあたり5MBまでのファイルを添付できます");
        e.target.value = "";
        return;
      }
      if (
        !(
          SUPPORT_ATTACHMENT_RULES.allowedMimeTypes as readonly string[]
        ).includes(f.type)
      ) {
        toast.error("添付できるのは画像（JPEG／PNG）とPDFのみです");
        e.target.value = "";
        return;
      }
    }
    setFiles(selected);
  }

  async function onSubmit(data: TroubleReportInput) {
    const formData = new FormData();
    formData.set("reporterName", data.reporterName);
    formData.set("counterpartyName", data.counterpartyName);
    formData.set("email", data.email);
    formData.set("category", data.category ?? "");
    formData.set("content", data.content);
    for (const file of files) {
      formData.append("attachments", file);
    }

    const result = await submitTroubleReportAction(formData);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-8">
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          トラブル報告
        </h1>
        <div className="space-y-4 text-center">
          <p className="text-body-md">トラブル報告を受け付けました。</p>
          <p className="text-body-sm text-muted-foreground">
            内容を確認のうえ、運営よりご連絡いたします。しばらくお待ちください。
          </p>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/mypage">マイページへもどる</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        トラブル報告
      </h1>
      <p className="text-center text-body-sm text-muted-foreground">
        受注者・発注者とのトラブルを運営に報告できます。
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="reporterName">氏名{REQUIRED_BADGE}</Label>
          <Input id="reporterName" {...register("reporterName")} />
          {errors.reporterName && (
            <p className="text-body-sm text-destructive">
              {errors.reporterName.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="counterpartyName">
            トラブル相手の氏名{REQUIRED_BADGE}
          </Label>
          <Input id="counterpartyName" {...register("counterpartyName")} />
          {errors.counterpartyName && (
            <p className="text-body-sm text-destructive">
              {errors.counterpartyName.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">メールアドレス{REQUIRED_BADGE}</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && (
            <p className="text-body-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="category">トラブル種類{OPTIONAL_BADGE}</Label>
          <Select
            value={watch("category") ?? ""}
            onValueChange={(v) =>
              setValue("category", v, { shouldValidate: true })
            }
          >
            <SelectTrigger id="category" className="bg-background">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {TROUBLE_CATEGORIES.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-body-sm text-destructive">
              {errors.category.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="content">内容{REQUIRED_BADGE}</Label>
          <Textarea id="content" rows={6} {...register("content")} />
          {errors.content && (
            <p className="text-body-sm text-destructive">
              {errors.content.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="attachments">資料添付{OPTIONAL_BADGE}</Label>
          <Input
            id="attachments"
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={handleFileChange}
          />
          <p className="text-body-sm text-muted-foreground">
            画像（JPEG／PNG）・PDF、最大5枚・各5MBまで
          </p>
          {files.length > 0 && (
            <ul className="text-body-sm text-muted-foreground">
              {files.map((f) => (
                <li key={f.name}>{f.name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 pt-4">
          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "送信中..." : "送信する"}
          </Button>
          <BackButton href="/mypage" className="w-full rounded-full" />
        </div>
      </form>
    </div>
  );
}
