"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TRADE_TYPES, PREFECTURES, GENDERS } from "@/lib/constants/options";
import { profileEditSchema, type ProfileEditInput } from "@/lib/validations/profile";
import { createClient } from "@/lib/supabase/client";
import {
  updateProfileAction,
  uploadAvatarAction,
} from "@/app/(authenticated)/profile/edit/actions";

const SELECT_CLASS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-body-md";

function RequiredBadge() {
  return <span className="text-destructive text-body-sm ml-1">必須</span>;
}

interface SkillRow {
  trade_type: string;
  experience_years: number | null;
}

export default function ProfileEditPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [qualificationInput, setQualificationInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    formState: { errors },
    setValue,
    watch,
    reset,
    getValues,
  } = useForm<ProfileEditInput>({
    defaultValues: {
      lastName: "",
      firstName: "",
      gender: "",
      birthDate: "",
      email: "",
      prefecture: "",
      companyName: "",
      bio: "",
      skills: [{ tradeType: "", experienceYears: 0 }],
      qualifications: [],
      availableAreas: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "skills",
  });

  const watchedAreas = watch("availableAreas");
  const watchedQualifications = watch("qualifications");

  const handleAreaToggle = useCallback(
    (prefecture: string, checked: boolean) => {
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
    },
    [watchedAreas, setValue]
  );

  // Fetch current profile data on mount
  useEffect(() => {
    async function fetchProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setCurrentEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("users")
        .select(
          "last_name, first_name, gender, birth_date, prefecture, company_name, bio, avatar_url"
        )
        .eq("id", user.id)
        .single();

      const { data: userSkills } = await supabase
        .from("user_skills")
        .select("trade_type, experience_years")
        .eq("user_id", user.id);

      const { data: userAreas } = await supabase
        .from("user_available_areas")
        .select("prefecture")
        .eq("user_id", user.id);

      const { data: userQualifications } = await supabase
        .from("user_qualifications")
        .select("qualification_name")
        .eq("user_id", user.id);

      if (profile) {
        setAvatarUrl(profile.avatar_url);

        const skills: { tradeType: string; experienceYears: number }[] =
          userSkills && userSkills.length > 0
            ? userSkills.map((s: SkillRow) => ({
                tradeType: s.trade_type,
                experienceYears: s.experience_years ?? 0,
              }))
            : [{ tradeType: "", experienceYears: 0 }];

        const areas = userAreas
          ? userAreas.map((a: { prefecture: string }) => a.prefecture)
          : [];

        const qualifications = userQualifications
          ? userQualifications.map(
              (q: { qualification_name: string }) => q.qualification_name
            )
          : [];

        reset({
          lastName: profile.last_name ?? "",
          firstName: profile.first_name ?? "",
          gender: profile.gender ?? "",
          birthDate: profile.birth_date ?? "",
          email: user.email ?? "",
          prefecture: profile.prefecture ?? "",
          companyName: profile.company_name ?? "",
          bio: profile.bio ?? "",
          skills,
          qualifications,
          availableAreas: areas,
        });
      }

      setIsLoading(false);
    }

    fetchProfile();
  }, [router, reset]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    setServerError("");

    const formData = new FormData();
    formData.append("avatar", file);

    startTransition(async () => {
      try {
        const result = await uploadAvatarAction(formData);
        if (result.success && result.data) {
          setAvatarUrl(result.data.avatarUrl);
        } else if (!result.success) {
          setServerError(result.error);
        }
      } catch {
        setServerError("アップロードに失敗しました。もう一度お試しください。");
      } finally {
        setAvatarUploading(false);
      }
    });
  }

  function handleAddQualification() {
    const trimmed = qualificationInput.trim();
    if (!trimmed) return;
    const current = watchedQualifications ?? [];
    if (!current.includes(trimmed)) {
      setValue("qualifications", [...current, trimmed], {
        shouldValidate: true,
      });
    }
    setQualificationInput("");
  }

  function handleRemoveQualification(index: number) {
    const current = watchedQualifications ?? [];
    setValue(
      "qualifications",
      current.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  }

  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    setValidationErrors({});

    const data = getValues();

    // Manual Zod validation
    const parsed = profileEditSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setValidationErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("lastName", parsed.data.lastName);
    formData.append("firstName", parsed.data.firstName);
    formData.append("gender", parsed.data.gender);
    formData.append("birthDate", parsed.data.birthDate);
    formData.append("email", parsed.data.email ?? "");
    formData.append("prefecture", parsed.data.prefecture);
    formData.append("companyName", parsed.data.companyName ?? "");
    formData.append("bio", parsed.data.bio ?? "");
    formData.append("skills", JSON.stringify(parsed.data.skills));
    formData.append(
      "qualifications",
      JSON.stringify(parsed.data.qualifications ?? [])
    );
    formData.append(
      "availableAreas",
      JSON.stringify(parsed.data.availableAreas)
    );

    startTransition(async () => {
      try {
        const result = await updateProfileAction(formData);
        if (result.success) {
          router.push("/profile");
        } else {
          setServerError(result.error);
        }
      } catch {
        setServerError("保存に失敗しました。もう一度お試しください。");
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8 md:max-w-2xl md:mx-auto">
        <p className="text-center text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 md:max-w-2xl md:mx-auto">
      <h1 className="text-heading-lg font-bold">ユーザープロフィール編集</h1>

      {serverError && (
        <p className="mt-4 text-body-sm text-destructive">{serverError}</p>
      )}

      <form onSubmit={handleFormSubmit} className="mt-6 space-y-8">
        {/* ── 基本情報 ── */}
        <section className="space-y-4">
          <h2 className="text-heading-md font-bold">基本情報</h2>

          {/* Avatar */}
          <div className="space-y-1">
            <Label>プロフィール画像</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative rounded-full w-20 h-20 overflow-hidden border border-input bg-muted flex items-center justify-center"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="アバター"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground text-body-sm">
                    写真
                  </span>
                )}
              </button>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarUploading ? "アップロード中..." : "画像を変更"}
                </Button>
                <p className="mt-1 text-muted-foreground text-body-sm">
                  JPEG、PNG形式（5MB以下）
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>

          {/* 姓 */}
          <div className="space-y-1">
            <Label htmlFor="lastName">
              姓
              <RequiredBadge />
            </Label>
            <Input
              id="lastName"
              placeholder="山田"
              {...register("lastName")}
            />
            {validationErrors["lastName"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["lastName"]}
              </p>
            )}
          </div>

          {/* 名 */}
          <div className="space-y-1">
            <Label htmlFor="firstName">
              名
              <RequiredBadge />
            </Label>
            <Input
              id="firstName"
              placeholder="太郎"
              {...register("firstName")}
            />
            {validationErrors["firstName"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["firstName"]}
              </p>
            )}
          </div>

          {/* 性別 */}
          <div className="space-y-1">
            <Label htmlFor="gender">
              性別
              <RequiredBadge />
            </Label>
            <select
              id="gender"
              className={SELECT_CLASS}
              {...register("gender")}
            >
              <option value="">選択してください</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {validationErrors["gender"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["gender"]}
              </p>
            )}
          </div>

          {/* 生年月日 */}
          <div className="space-y-1">
            <Label htmlFor="birthDate">
              生年月日
              <RequiredBadge />
            </Label>
            <Input
              id="birthDate"
              type="date"
              {...register("birthDate")}
            />
            {validationErrors["birthDate"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["birthDate"]}
              </p>
            )}
          </div>

          {/* メールアドレス */}
          <div className="space-y-1">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              placeholder="sample@sample.com"
              {...register("email")}
            />
            {currentEmail && (
              <p className="text-muted-foreground text-body-sm">
                現在: {currentEmail}
              </p>
            )}
            {validationErrors["email"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["email"]}
              </p>
            )}
          </div>

          {/* 会社名/屋号 */}
          <div className="space-y-1">
            <Label htmlFor="companyName">会社名/屋号</Label>
            <Input
              id="companyName"
              placeholder="株式会社〇〇"
              {...register("companyName")}
            />
          </div>

          {/* お住まい（都道府県） */}
          <div className="space-y-1">
            <Label htmlFor="prefecture">
              お住まい（都道府県）
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
            {validationErrors["prefecture"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["prefecture"]}
              </p>
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
            {validationErrors["availableAreas"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["availableAreas"]}
              </p>
            )}
          </div>
        </section>

        {/* ── 自己紹介 ── */}
        <section className="space-y-4">
          <h2 className="text-heading-md font-bold">自己紹介</h2>
          <div className="space-y-1">
            <Label htmlFor="bio">自己紹介文</Label>
            <Textarea
              id="bio"
              placeholder="経歴やアピールポイントを記入してください"
              rows={5}
              {...register("bio")}
            />
          </div>
        </section>

        {/* ── 能力 ── */}
        <section className="space-y-4">
          <h2 className="text-heading-md font-bold">能力</h2>

          {/* Skills (trade type + experience years) */}
          <div className="space-y-3">
            <Label>
              対応できる職種
              <RequiredBadge />
            </Label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
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
                  {validationErrors[`skills.${index}.tradeType`] && (
                    <p className="text-body-sm text-destructive">
                      {validationErrors[`skills.${index}.tradeType`]}
                    </p>
                  )}
                </div>
                <div className="w-24 space-y-1">
                  <Input
                    type="number"
                    min={0}
                    placeholder="年数"
                    {...register(`skills.${index}.experienceYears`, {
                      valueAsNumber: true,
                    })}
                  />
                  {validationErrors[`skills.${index}.experienceYears`] && (
                    <p className="text-body-sm text-destructive">
                      {validationErrors[`skills.${index}.experienceYears`]}
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
            {validationErrors["skills"] && (
              <p className="text-body-sm text-destructive">
                {validationErrors["skills"]}
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

          {/* Qualifications */}
          <div className="space-y-2">
            <Label>資格・免許</Label>
            <div className="flex gap-2">
              <Input
                placeholder="資格名を入力"
                value={qualificationInput}
                onChange={(e) => setQualificationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddQualification();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddQualification}
              >
                追加
              </Button>
            </div>
            {(watchedQualifications ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(watchedQualifications ?? []).map((q, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-3 py-1 text-body-sm"
                  >
                    {q}
                    <button
                      type="button"
                      onClick={() => handleRemoveQualification(i)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`${q}を削除`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Buttons ── */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting || isPending}
            className="h-12 w-full rounded-pill bg-secondary font-bold text-white hover:bg-secondary/90"
          >
            {isSubmitting || isPending ? "送信中..." : "確認する"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-pill"
            onClick={() => router.back()}
          >
            もどる
          </Button>
        </div>
      </form>
    </div>
  );
}
