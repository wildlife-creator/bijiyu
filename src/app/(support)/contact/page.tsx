"use client";

import { useRef, useState } from "react";
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
import {
  CONTACT_INDUSTRIES,
  CONTACT_INQUIRY_TYPES,
  CONTACT_PURPOSES,
  CONTACT_VIDEO_CONSULTATIONS,
} from "@/lib/constants/contact-options";
import {
  SUPPORT_ATTACHMENT_RULES,
  SUPPORT_ATTACHMENTS_BUCKET,
} from "@/lib/support/attachments";
import { contactSchema, type ContactInput } from "@/lib/validations/contact";
import { submitContactAction } from "./actions";

const REQUIRED_BADGE = (
  <span className="ml-1 text-body-sm text-destructive">必須</span>
);
const OPTIONAL_BADGE = (
  <span className="ml-1 text-body-sm text-muted-foreground">〔任意〕</span>
);

const ACCEPT_ATTR = "image/jpeg,image/png,application/pdf";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      companyName: "",
      name: "",
      phone: "",
      email: "",
      address: "",
      inquiryType: "",
      purpose: "",
      industry: "",
      projectDescription: "",
      projectArea: "",
      videoConsultation: "",
      detail: "",
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    // 同じファイルの再選択を許可し、state とのズレを防ぐため input を空に戻す
    e.target.value = "";
    if (selected.length === 0) return;

    // 既存の選択に追加する（名前＋サイズが同じものは重複として除く）
    const merged = [...files];
    for (const f of selected) {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) {
        merged.push(f);
      }
    }

    // クライアント側の軽い検証（最終判定はサーバー）
    if (merged.length > SUPPORT_ATTACHMENT_RULES.maxFiles) {
      toast.error(
        `添付できるファイルは最大${SUPPORT_ATTACHMENT_RULES.maxFiles}件です`,
      );
      return;
    }
    for (const f of selected) {
      if (f.size > SUPPORT_ATTACHMENT_RULES.maxBytesPerFile) {
        toast.error("1ファイルあたり5MBまでのファイルを添付できます");
        return;
      }
      if (
        !(
          SUPPORT_ATTACHMENT_RULES.allowedMimeTypes as readonly string[]
        ).includes(f.type)
      ) {
        toast.error("添付できるのは画像（JPEG／PNG）とPDFのみです");
        return;
      }
    }
    setFiles(merged);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(data: ContactInput) {
    const formData = new FormData();
    formData.set("companyName", data.companyName);
    formData.set("name", data.name);
    formData.set("phone", data.phone);
    formData.set("email", data.email);
    formData.set("address", data.address ?? "");
    formData.set("inquiryType", data.inquiryType);
    formData.set("purpose", data.purpose);
    formData.set("industry", data.industry);
    formData.set("projectDescription", data.projectDescription ?? "");
    formData.set("projectArea", data.projectArea ?? "");
    formData.set("videoConsultation", data.videoConsultation ?? "");
    formData.set("detail", data.detail);
    for (const file of files) {
      formData.append("attachments", file);
    }

    const result = await submitContactAction(formData);
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
          お問い合わせ
        </h1>
        <div className="space-y-4 text-center">
          <p className="text-body-md">お問い合わせを受け付けました。</p>
          <p className="text-body-sm text-muted-foreground">
            内容を確認のうえ、ご連絡いたします。しばらくお待ちください。
          </p>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/">トップへもどる</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        お問い合わせ
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* セクション1: 基本情報 */}
        <section className="space-y-4">
          <h2 className="text-body-lg font-bold text-secondary">基本情報</h2>

          <div className="space-y-1">
            <Label htmlFor="companyName">会社名／屋号{REQUIRED_BADGE}</Label>
            <Input id="companyName" {...register("companyName")} />
            {errors.companyName && (
              <p className="text-body-sm text-destructive">
                {errors.companyName.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">氏名{REQUIRED_BADGE}</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-body-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">電話番号{REQUIRED_BADGE}</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && (
              <p className="text-body-sm text-destructive">
                {errors.phone.message}
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
            <Label htmlFor="address">所在地{OPTIONAL_BADGE}</Label>
            <Input id="address" {...register("address")} />
          </div>

          <ChoiceField
            id="purpose"
            label="ビジ友の利用目的"
            required
            options={CONTACT_PURPOSES}
            value={watch("purpose")}
            onChange={(v) => setValue("purpose", v, { shouldValidate: true })}
            error={errors.purpose?.message}
          />

          <ChoiceField
            id="industry"
            label="業種・職種"
            required
            options={CONTACT_INDUSTRIES}
            value={watch("industry")}
            onChange={(v) => setValue("industry", v, { shouldValidate: true })}
            error={errors.industry?.message}
          />
        </section>

        {/* セクション2: お問い合わせについて */}
        <section className="space-y-4">
          <h2 className="text-body-lg font-bold text-secondary">
            お問い合わせ内容
          </h2>

          <ChoiceField
            id="inquiryType"
            label="お問い合わせの種類"
            required
            options={CONTACT_INQUIRY_TYPES}
            value={watch("inquiryType")}
            onChange={(v) =>
              setValue("inquiryType", v, { shouldValidate: true })
            }
            error={errors.inquiryType?.message}
          />

          <div className="space-y-1">
            <Label htmlFor="detail">問い合わせ詳細{REQUIRED_BADGE}</Label>
            <Textarea id="detail" rows={5} {...register("detail")} />
            {errors.detail && (
              <p className="text-body-sm text-destructive">
                {errors.detail.message}
              </p>
            )}
          </div>
        </section>

        {/* セクション3: 案件情報 */}
        <section className="space-y-4">
          <h2 className="text-body-lg font-bold text-secondary">案件情報</h2>

          <div className="space-y-1">
            <Label htmlFor="projectArea">工事エリア{OPTIONAL_BADGE}</Label>
            <Input id="projectArea" {...register("projectArea")} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="projectDescription">工事内容{OPTIONAL_BADGE}</Label>
            <Textarea
              id="projectDescription"
              rows={3}
              {...register("projectDescription")}
            />
          </div>
        </section>

        {/* セクション4: 動画掲載の相談 */}
        <section className="space-y-4">
          <h2 className="text-body-lg font-bold text-secondary">
            動画掲載の相談{OPTIONAL_BADGE}
          </h2>

          <ChoiceField
            id="videoConsultation"
            label="動画掲載の相談"
            hideLabel
            options={CONTACT_VIDEO_CONSULTATIONS}
            value={watch("videoConsultation") ?? ""}
            onChange={(v) =>
              setValue("videoConsultation", v, { shouldValidate: true })
            }
            error={errors.videoConsultation?.message}
          />
        </section>

        {/* セクション5: 資料添付 */}
        <section className="space-y-4">
          <h2 className="text-body-lg font-bold text-secondary">
            資料添付{OPTIONAL_BADGE}
          </h2>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              id="attachments"
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              aria-label="資料添付"
              data-bucket={SUPPORT_ATTACHMENTS_BUCKET}
              className="sr-only"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
            >
              ファイルを選ぶ
            </Button>
            <p className="text-body-sm text-muted-foreground">
              画像（JPEG／PNG）・PDF、最大5枚・各5MBまで
            </p>
            {files.length > 0 && (
              <ul className="space-y-1 pt-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}`}
                    className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-body-sm"
                  >
                    <span className="truncate text-muted-foreground">
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`${f.name}を削除`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="flex flex-col items-center gap-4 pt-4">
          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "送信中..." : "送信する"}
          </Button>
          <BackButton className="w-full rounded-full" />
        </div>
      </form>
    </div>
  );
}

// 同一ファイル内のヘルパー: 単一選択フィールド（shadcn Select）
interface ChoiceFieldProps {
  id: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  hideLabel?: boolean;
}

function ChoiceField({
  id,
  label,
  options,
  value,
  onChange,
  required = false,
  error,
  hideLabel = false,
}: ChoiceFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
        {required ? REQUIRED_BADGE : OPTIONAL_BADGE}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="bg-background">
          <SelectValue placeholder="選択してください" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-body-sm text-destructive">{error}</p>}
    </div>
  );
}
