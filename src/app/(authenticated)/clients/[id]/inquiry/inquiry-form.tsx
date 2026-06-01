"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/shared/back-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  INQUIRY_TOPICS,
  type InquiryTopic,
} from "@/lib/constants/job-inquiry-options";
import { jobInquirySchema } from "@/lib/validations/job-inquiry";
import { submitJobInquiryAction } from "./actions";

// Zod の content は .optional().default("") のため input と output で型が異なる。
// react-hook-form には input/output 型を明示して渡す。
type JobInquiryFormInput = z.input<typeof jobInquirySchema>;
type JobInquiryFormOutput = z.output<typeof jobInquirySchema>;

const REQUIRED_BADGE = (
  <span className="ml-1 text-body-sm text-destructive">必須</span>
);
const OPTIONAL_BADGE = (
  <span className="ml-1 text-body-sm text-muted-foreground">〔任意〕</span>
);

interface InquiryFormProps {
  defaultName: string;
  defaultEmail: string;
  targetClientId: string;
  targetDisplayName: string;
}

export function InquiryForm({
  defaultName,
  defaultEmail,
  targetClientId,
  targetDisplayName,
}: InquiryFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<JobInquiryFormInput, unknown, JobInquiryFormOutput>({
    resolver: zodResolver(jobInquirySchema),
    defaultValues: {
      name: defaultName,
      email: defaultEmail,
      topics: [],
      content: "",
    },
  });

  const selectedTopics = watch("topics") ?? [];

  function toggleTopic(topic: InquiryTopic, checked: boolean) {
    const next = checked
      ? [...selectedTopics, topic]
      : selectedTopics.filter((t) => t !== topic);
    setValue("topics", next, { shouldValidate: true });
  }

  async function onSubmit(data: JobInquiryFormOutput) {
    const formData = new FormData();
    formData.set("name", data.name);
    formData.set("email", data.email);
    formData.set("content", data.content ?? "");
    for (const topic of data.topics) {
      formData.append("topics", topic);
    }

    const result = await submitJobInquiryAction(targetClientId, formData);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    router.push(`/clients/${targetClientId}?inquiry=success`);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1 text-center">
        <h1 className="text-heading-lg font-bold text-secondary">
          求人へのお問い合わせ
        </h1>
        <p className="text-body-sm text-muted-foreground">
          {targetDisplayName}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-1">
          <Label htmlFor="name">氏名{REQUIRED_BADGE}</Label>
          <Input id="name" className="bg-background" {...register("name")} />
          {errors.name && (
            <p className="text-body-sm text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">メールアドレス{REQUIRED_BADGE}</Label>
          <Input
            id="email"
            type="email"
            className="bg-background"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-body-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-body-md font-medium">
            お問い合わせ項目{REQUIRED_BADGE}
          </legend>
          <div className="space-y-2">
            {INQUIRY_TOPICS.map((topic) => {
              const checkboxId = `topic-${topic}`;
              const checked = selectedTopics.includes(topic);
              return (
                <Label
                  key={topic}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-input bg-background px-3 py-2.5 font-normal"
                >
                  <Checkbox
                    id={checkboxId}
                    aria-label={topic}
                    checked={checked}
                    onCheckedChange={(value) =>
                      toggleTopic(topic, value === true)
                    }
                  />
                  <span className="text-body-md text-foreground">{topic}</span>
                </Label>
              );
            })}
          </div>
          {errors.topics && (
            <p className="text-body-sm text-destructive">
              {errors.topics.message}
            </p>
          )}
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="content">お問い合わせ内容{OPTIONAL_BADGE}</Label>
          <Textarea
            id="content"
            rows={6}
            className="bg-background"
            {...register("content")}
          />
          {errors.content && (
            <p className="text-body-sm text-destructive">
              {errors.content.message}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 pt-4">
          <Button
            type="submit"
            className="w-full max-w-xs rounded-full bg-primary text-primary-foreground text-white hover:bg-primary/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? "送信中..." : "送信する"}
          </Button>
          <BackButton className="w-full max-w-xs rounded-full" />
        </div>
      </form>
    </div>
  );
}
