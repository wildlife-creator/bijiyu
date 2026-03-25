"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TRADE_TYPES, PREFECTURES, GENDERS } from "@/lib/constants/options";
import {
  registerProfileFormSchema,
  type RegisterProfileFormInput,
} from "@/lib/validations/auth";
import { completeRegistrationAction } from "@/app/(auth)/register/profile/actions";

const SELECT_CLASS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-body-md";

function RequiredBadge() {
  return <span className="text-destructive text-body-sm ml-1">必須</span>;
}

export default function RegisterProfilePage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setValue,
    watch,
  } = useForm<RegisterProfileFormInput>({
    resolver: zodResolver(registerProfileFormSchema),
    defaultValues: {
      lastName: "",
      firstName: "",
      gender: "",
      birthDate: "",
      prefecture: "",
      companyName: "",
      skills: [{ tradeType: "", experienceYears: 0 }],
      availableAreas: [],
      password: "",
      confirmPassword: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "skills",
  });

  const watchedAreas = watch("availableAreas");

  function handleAreaToggle(prefecture: string, checked: boolean) {
    const current = watchedAreas ?? [];
    if (checked) {
      setValue("availableAreas", [...current, prefecture], {
        shouldValidate: true,
      });
    } else {
      setValue(
        "availableAreas",
        current.filter((a) => a !== prefecture),
        { shouldValidate: true }
      );
    }
  }

  async function onSubmit(data: RegisterProfileFormInput) {
    setServerError("");
    setIsSubmitting(true);

    try {
      // Strip confirmPassword before sending to server
      const { confirmPassword: _, ...serverData } = data;
      const result = await completeRegistrationAction(serverData);
      if (result.success) {
        router.push("/register/complete");
      } else {
        setServerError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-center text-heading-lg font-bold text-primary">
        新規会員登録
      </h1>

      {serverError && (
        <p className="text-center text-destructive text-body-md">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* 姓 */}
        <div className="space-y-1.5">
          <Label htmlFor="lastName">
            姓
            <RequiredBadge />
          </Label>
          <Input id="lastName" placeholder="山田" {...register("lastName")} />
          {errors.lastName && (
            <p className="text-destructive text-body-sm">
              {errors.lastName.message}
            </p>
          )}
        </div>

        {/* 名 */}
        <div className="space-y-1.5">
          <Label htmlFor="firstName">
            名
            <RequiredBadge />
          </Label>
          <Input
            id="firstName"
            placeholder="太郎"
            {...register("firstName")}
          />
          {errors.firstName && (
            <p className="text-destructive text-body-sm">
              {errors.firstName.message}
            </p>
          )}
        </div>

        {/* 性別 */}
        <div className="space-y-1.5">
          <Label htmlFor="gender">
            性別
            <RequiredBadge />
          </Label>
          <select id="gender" className={SELECT_CLASS} {...register("gender")}>
            <option value="">選択してください</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {errors.gender && (
            <p className="text-destructive text-body-sm">
              {errors.gender.message}
            </p>
          )}
        </div>

        {/* 生年月日 */}
        <div className="space-y-1.5">
          <Label htmlFor="birthDate">
            生年月日
            <RequiredBadge />
          </Label>
          <Input id="birthDate" type="date" {...register("birthDate")} />
          {errors.birthDate && (
            <p className="text-destructive text-body-sm">
              {errors.birthDate.message}
            </p>
          )}
        </div>

        {/* 会社名/屋号 */}
        <div className="space-y-1.5">
          <Label htmlFor="companyName">会社名/屋号</Label>
          <Input
            id="companyName"
            placeholder="株式会社〇〇"
            {...register("companyName")}
          />
          <p className="text-muted-foreground text-body-sm">
            ※ ない場合は「なし」と入力をお願いします
          </p>
        </div>

        {/* お住まい */}
        <div className="space-y-1.5">
          <Label htmlFor="prefecture">
            お住まい
            <RequiredBadge />
          </Label>
          <select
            id="prefecture"
            className={SELECT_CLASS}
            {...register("prefecture")}
          >
            <option value="">選択してください</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {errors.prefecture && (
            <p className="text-destructive text-body-sm">
              {errors.prefecture.message}
            </p>
          )}
        </div>

        {/* 対応できる職種 */}
        <div className="space-y-3">
          <Label>
            対応できる職種
            <RequiredBadge />
          </Label>
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <select
                  className={SELECT_CLASS}
                  {...register(`skills.${index}.tradeType`)}
                >
                  <option value="">職種を選択</option>
                  {TRADE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {errors.skills?.[index]?.tradeType && (
                  <p className="text-destructive text-body-sm">
                    {errors.skills[index].tradeType.message}
                  </p>
                )}
              </div>
              <div className="w-24 space-y-1.5">
                <Input
                  type="number"
                  min={0}
                  placeholder="年数"
                  {...register(`skills.${index}.experienceYears`, {
                    valueAsNumber: true,
                  })}
                />
                {errors.skills?.[index]?.experienceYears && (
                  <p className="text-destructive text-body-sm">
                    {errors.skills[index].experienceYears.message}
                  </p>
                )}
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  aria-label="削除"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {errors.skills?.message && (
            <p className="text-destructive text-body-sm">
              {errors.skills.message}
            </p>
          )}
          {fields.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ tradeType: "", experienceYears: 0 })}
            >
              <Plus className="size-4" />
              職種を追加
            </Button>
          )}
        </div>

        {/* 対応可能エリア */}
        <div className="space-y-2">
          <Label>
            対応可能エリア
            <RequiredBadge />
          </Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PREFECTURES.map((pref) => (
              <label
                key={pref}
                className="flex items-center gap-1.5 text-body-sm"
              >
                <Checkbox
                  checked={(watchedAreas ?? []).includes(pref)}
                  onCheckedChange={(checked) =>
                    handleAreaToggle(pref, checked === true)
                  }
                />
                {pref}
              </label>
            ))}
          </div>
          {errors.availableAreas?.message && (
            <p className="text-destructive text-body-sm">
              {errors.availableAreas.message}
            </p>
          )}
        </div>

        {/* パスワード */}
        <div className="space-y-1.5">
          <Label htmlFor="password">
            パスワード
            <RequiredBadge />
          </Label>
          <Input id="password" type="password" {...register("password")} />
          <p className="text-muted-foreground text-body-sm">
            ※ 半角英数字の組み合わせ、8〜16文字
          </p>
          {errors.password && (
            <p className="text-destructive text-body-sm">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* パスワード（確認） */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">
            パスワード（確認）
            <RequiredBadge />
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            {...register("confirmPassword")}
          />
          <p className="text-muted-foreground text-body-sm">
            ※ 半角英数字の組み合わせ、8〜16文字
          </p>
          {errors.confirmPassword && (
            <p className="text-destructive text-body-sm">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-12 w-full rounded-[47px] bg-secondary font-bold text-white hover:bg-secondary/90"
        >
          {isSubmitting ? "送信中..." : "入力内容を確認する"}
        </Button>
      </form>
    </div>
  );
}
