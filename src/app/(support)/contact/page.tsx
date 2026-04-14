"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { contactSchema, type ContactInput } from "@/lib/validations/profile";
import { CONTACT_TYPES } from "@/lib/constants/profile-options";
import { submitContactAction } from "./actions";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      lastName: "",
      firstName: "",
      email: "",
      contactTypes: [],
      content: "",
    },
  });

  const selectedTypes = watch("contactTypes");

  function handleCheckboxChange(type: string, checked: boolean) {
    const current = selectedTypes ?? [];
    if (checked) {
      setValue("contactTypes", [...current, type], { shouldValidate: true });
    } else {
      setValue(
        "contactTypes",
        current.filter((t) => t !== type),
        { shouldValidate: true },
      );
    }
  }

  async function onSubmit(data: ContactInput) {
    setServerError(null);

    const formData = new FormData();
    formData.set("lastName", data.lastName);
    formData.set("firstName", data.firstName);
    formData.set("email", data.email);
    for (const type of data.contactTypes) {
      formData.append("contactTypes", type);
    }
    formData.set("content", data.content);

    const result = await submitContactAction(formData);

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-8">
        <h1 className="text-center text-heading-lg font-bold text-secondary">お問い合わせ</h1>

        <div className="space-y-4 text-center">
          <p className="text-body-md">
            お問い合わせを受け付けました。
          </p>
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
      <h1 className="text-center text-heading-lg font-bold text-secondary">お問い合わせ</h1>

      {serverError && (
        <p className="text-center text-body-sm text-destructive">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Last name */}
        <div className="space-y-1">
          <Label htmlFor="lastName">
            姓
            <span className="ml-1 text-body-sm text-destructive">必須</span>
          </Label>
          <Input id="lastName" {...register("lastName")} />
          {errors.lastName && (
            <p className="text-body-sm text-destructive">
              {errors.lastName.message}
            </p>
          )}
        </div>

        {/* First name */}
        <div className="space-y-1">
          <Label htmlFor="firstName">
            名
            <span className="ml-1 text-body-sm text-destructive">必須</span>
          </Label>
          <Input id="firstName" {...register("firstName")} />
          {errors.firstName && (
            <p className="text-body-sm text-destructive">
              {errors.firstName.message}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1">
          <Label htmlFor="email">
            メールアドレス
            <span className="ml-1 text-body-sm text-destructive">必須</span>
          </Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && (
            <p className="text-body-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Contact types */}
        <fieldset className="space-y-2">
          <legend className="text-body-md font-medium">
            お問い合わせ項目
            <span className="ml-1 text-body-sm text-destructive">必須</span>
          </legend>
          {CONTACT_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={`contactType-${type}`}
                checked={selectedTypes?.includes(type) ?? false}
                onCheckedChange={(checked) =>
                  handleCheckboxChange(type, checked === true)
                }
              />
              <Label
                htmlFor={`contactType-${type}`}
                className="text-body-md font-normal"
              >
                {type}
              </Label>
            </div>
          ))}
          {errors.contactTypes && (
            <p className="text-body-sm text-destructive">
              {errors.contactTypes.message}
            </p>
          )}
        </fieldset>

        {/* Content */}
        <div className="space-y-1">
          <Label htmlFor="content">
            お問い合わせ内容
            <span className="ml-1 text-body-sm text-destructive">必須</span>
          </Label>
          <Textarea id="content" rows={5} {...register("content")} />
          {errors.content && (
            <p className="text-body-sm text-destructive">
              {errors.content.message}
            </p>
          )}
        </div>

        {/* Submit */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "送信中..." : "送信する"}
          </Button>

          <Button variant="outline" className="w-full rounded-full" asChild>
            <Link href="/">もどる</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
