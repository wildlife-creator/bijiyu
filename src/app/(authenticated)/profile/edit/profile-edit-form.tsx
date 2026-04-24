"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/shared/back-button";
import { TRADE_TYPES, PREFECTURES, GENDERS } from "@/lib/constants/options";
import {
  profileEditSchema,
  type ProfileEditInput,
} from "@/lib/validations/profile";
import { createClient } from "@/lib/supabase/client";
import {
  updateProfileAction,
  uploadAvatarAction,
} from "@/app/(authenticated)/profile/edit/actions";

/**
 * COM-002: ユーザープロフィール編集
 *
 * CLI-021 と同じ視覚パターンに統一:
 * - bg-muted page + 白カード
 * - Avatar upload: 円形 + 「画像を登録する」ボタン（中央寄せ）
 * - Input は bg-background
 * - お住まい / 性別 は shadcn Select
 * - 対応可能エリア は MultiSelect（47 都道府県）
 * - 資格は chips + +追加する
 * - 確認する / もどる は w-full max-w-xs rounded-pill centered
 */

function RequiredBadge() {
  return (
    <span className="ml-2 text-body-xs font-bold text-destructive">必須</span>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center text-body-sm font-bold text-foreground"
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-body-sm text-destructive">{message}</p>;
}

interface SkillRow {
  trade_type: string;
  experience_years: number | null;
}

export function ProfileEditForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [qualificationInput, setQualificationInput] = useState("");
  const [skillTagInput, setSkillTagInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
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
      skillTags: [],
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
  const watchedSkillTags = watch("skillTags");
  const watchedGender = watch("gender");
  const watchedPrefecture = watch("prefecture");

  const handleAreaChange = useCallback(
    (next: string[]) => {
      setValue("availableAreas", next, { shouldValidate: true });
    },
    [setValue],
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
          "last_name, first_name, gender, birth_date, prefecture, company_name, bio, avatar_url, skill_tags",
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
              (q: { qualification_name: string }) => q.qualification_name,
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
          skillTags: profile.skill_tags ?? [],
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
        setServerError(
          "アップロードに失敗しました。もう一度お試しください。",
        );
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
      { shouldValidate: true },
    );
  }

  function handleAddSkillTag() {
    const trimmed = skillTagInput.trim();
    if (!trimmed) return;
    const current = watchedSkillTags ?? [];
    if (!current.includes(trimmed)) {
      setValue("skillTags", [...current, trimmed], { shouldValidate: true });
    }
    setSkillTagInput("");
  }

  function handleRemoveSkillTag(index: number) {
    const current = watchedSkillTags ?? [];
    setValue(
      "skillTags",
      current.filter((_, i) => i !== index),
      { shouldValidate: true },
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
      "skillTags",
      JSON.stringify(parsed.data.skillTags ?? []),
    );
    formData.append(
      "qualifications",
      JSON.stringify(parsed.data.qualifications ?? []),
    );
    formData.append(
      "availableAreas",
      JSON.stringify(parsed.data.availableAreas),
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
      <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
        <p className="text-center text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザープロフィール編集
      </h1>

      {serverError && (
        <p className="mx-auto mt-4 max-w-2xl text-body-sm text-destructive">
          {serverError}
        </p>
      )}

      <form
        onSubmit={handleFormSubmit}
        className="mx-auto mt-6 max-w-2xl space-y-6"
      >
        {/* ── 基本情報 ── */}
        <section>
          <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>

          {/* Avatar */}
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="size-24 overflow-hidden rounded-full border border-border bg-background">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="プロフィール画像"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <img
                    src="/images/icons/icon-avatar.png"
                    alt=""
                    className="size-10 opacity-40"
                  />
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-pill"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading || isPending}
            >
              {avatarUploading ? "アップロード中..." : "画像を登録する"}
            </Button>
            <p className="text-body-xs text-muted-foreground">
              JPEG、PNG形式（5MB以下）
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={handleAvatarChange}
            />
          </div>

          <div className="mt-6 space-y-6">
            {/* 姓 */}
            <FieldGroup>
              <FieldLabel htmlFor="lastName">
                姓
                <RequiredBadge />
              </FieldLabel>
              <Input
                id="lastName"
                placeholder="山田"
                className="bg-background"
                {...register("lastName")}
              />
              <FieldError message={validationErrors["lastName"]} />
            </FieldGroup>

            {/* 名 */}
            <FieldGroup>
              <FieldLabel htmlFor="firstName">
                名
                <RequiredBadge />
              </FieldLabel>
              <Input
                id="firstName"
                placeholder="太郎"
                className="bg-background"
                {...register("firstName")}
              />
              <FieldError message={validationErrors["firstName"]} />
            </FieldGroup>

            {/* 性別 */}
            <FieldGroup>
              <FieldLabel htmlFor="gender">
                性別
                <RequiredBadge />
              </FieldLabel>
              <Select
                value={watchedGender ?? ""}
                onValueChange={(v) =>
                  setValue("gender", v, { shouldValidate: true })
                }
              >
                <SelectTrigger
                  id="gender"
                  className="w-full bg-background text-body-sm"
                >
                  <SelectValue placeholder="お選びください" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={validationErrors["gender"]} />
            </FieldGroup>

            {/* 生年月日 */}
            <FieldGroup>
              <FieldLabel htmlFor="birthDate">
                生年月日
                <RequiredBadge />
              </FieldLabel>
              <Input
                id="birthDate"
                type="date"
                className="bg-background"
                {...register("birthDate")}
              />
              <FieldError message={validationErrors["birthDate"]} />
            </FieldGroup>

            {/* メールアドレス */}
            <FieldGroup>
              <FieldLabel htmlFor="email">メールアドレス</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="sample@sample.com"
                className="bg-background"
                {...register("email")}
              />
              {currentEmail && (
                <p className="text-body-xs text-muted-foreground">
                  現在: {currentEmail}
                </p>
              )}
              <p className="text-body-xs text-muted-foreground">
                ※ 変更時は新しいメールアドレス宛に認証用メールが送られるため認証の対応をお願いします
              </p>
              <FieldError message={validationErrors["email"]} />
            </FieldGroup>

            {/* 会社名/屋号 */}
            <FieldGroup>
              <FieldLabel htmlFor="companyName">会社名/屋号</FieldLabel>
              <Input
                id="companyName"
                placeholder="株式会社〇〇"
                className="bg-background"
                {...register("companyName")}
              />
              <p className="text-body-xs text-muted-foreground">
                ※ ない場合は「なし」と入力をお願いします
              </p>
            </FieldGroup>

            {/* お住まい（都道府県） */}
            <FieldGroup>
              <FieldLabel htmlFor="prefecture">
                お住まい（都道府県）
                <RequiredBadge />
              </FieldLabel>
              <Select
                value={watchedPrefecture ?? ""}
                onValueChange={(v) =>
                  setValue("prefecture", v, { shouldValidate: true })
                }
              >
                <SelectTrigger
                  id="prefecture"
                  className="w-full bg-background text-body-sm"
                >
                  <SelectValue placeholder="お選びください" />
                </SelectTrigger>
                <SelectContent>
                  {PREFECTURES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={validationErrors["prefecture"]} />
            </FieldGroup>

            {/* 対応可能エリア — 複数選択可能なプルダウン */}
            <FieldGroup>
              <FieldLabel htmlFor="availableAreas">
                対応可能エリア
                <RequiredBadge />
              </FieldLabel>
              <MultiSelect
                id="availableAreas"
                options={PREFECTURES}
                value={watchedAreas ?? []}
                onChange={handleAreaChange}
                placeholder="お選びください"
                disabled={isPending}
              />
              <FieldError message={validationErrors["availableAreas"]} />
            </FieldGroup>
          </div>
        </section>

        {/* ── 自己紹介 ── */}
        <section>
          <h2 className="text-body-lg font-bold text-foreground">自己紹介</h2>
          <div className="mt-4">
            <FieldGroup>
              <FieldLabel htmlFor="bio">自己紹介文</FieldLabel>
              <Textarea
                id="bio"
                rows={6}
                className="bg-background"
                placeholder="経歴やアピールポイントを記入してください"
                {...register("bio")}
              />
            </FieldGroup>
          </div>
        </section>

        {/* ── 能力 ── */}
        <section>
          <h2 className="text-body-lg font-bold text-foreground">能力</h2>
          <div className="mt-4 space-y-6">
            {/* 対応できる職種 + 経験年数（行ごと） */}
            <FieldGroup>
              <FieldLabel>
                対応できる職種
                <RequiredBadge />
              </FieldLabel>
              {/* カラム見出し（職種 / 経験年数）。入力欄が何の数値か分かるよう明示する */}
              <div className="flex items-center gap-2 text-body-xs font-medium text-muted-foreground">
                <span className="flex-1">職種</span>
                <span className="w-28 shrink-0">経験年数（年）</span>
                {fields.length > 1 && <span className="w-9 shrink-0" aria-hidden />}
              </div>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Select
                        value={watch(`skills.${index}.tradeType`) ?? ""}
                        onValueChange={(v) =>
                          setValue(`skills.${index}.tradeType`, v, {
                            shouldValidate: true,
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={`職種 ${index + 1}`}
                          className="w-full bg-background text-body-sm"
                        >
                          <SelectValue placeholder="職種を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {TRADE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError
                        message={validationErrors[`skills.${index}.tradeType`]}
                      />
                    </div>
                    <div className="w-28 shrink-0 space-y-1">
                      <Input
                        type="number"
                        min={0}
                        placeholder="例: 5"
                        aria-label={`経験年数 ${index + 1}（年）`}
                        className="bg-background"
                        {...register(`skills.${index}.experienceYears`, {
                          valueAsNumber: true,
                        })}
                      />
                      <FieldError
                        message={
                          validationErrors[`skills.${index}.experienceYears`]
                        }
                      />
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        aria-label="削除"
                        className="mt-1"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <FieldError message={validationErrors["skills"]} />
                {fields.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-pill"
                    onClick={() =>
                      append({ tradeType: "", experienceYears: 0 })
                    }
                  >
                    <Plus className="size-4" />
                    職種を追加
                  </Button>
                )}
              </div>
            </FieldGroup>

            {/* 保有スキル */}
            <FieldGroup>
              <FieldLabel htmlFor="skillTagInput">保有スキル</FieldLabel>
              <p className="text-body-xs text-muted-foreground">
                得意とする工種・作業内容を追加できます（例: 型枠設置、電気工、送配電線工）
              </p>
              <div className="flex gap-2">
                <Input
                  id="skillTagInput"
                  placeholder="スキルを入力"
                  className="bg-background"
                  value={skillTagInput}
                  onChange={(e) => setSkillTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSkillTag();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-pill"
                  onClick={handleAddSkillTag}
                >
                  <Plus className="size-4" />
                  追加
                </Button>
              </div>
              {(watchedSkillTags ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(watchedSkillTags ?? []).map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-body-sm text-foreground"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => handleRemoveSkillTag(i)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`${s}を削除`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </FieldGroup>

            {/* 保有資格 */}
            <FieldGroup>
              <FieldLabel htmlFor="qualificationInput">保有資格</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="qualificationInput"
                  placeholder="資格名を入力"
                  className="bg-background"
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
                  className="rounded-pill"
                  onClick={handleAddQualification}
                >
                  <Plus className="size-4" />
                  追加
                </Button>
              </div>
              {(watchedQualifications ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(watchedQualifications ?? []).map((q, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-body-sm text-foreground"
                    >
                      {q}
                      <button
                        type="button"
                        onClick={() => handleRemoveQualification(i)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`${q}を削除`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </FieldGroup>
          </div>
        </section>

        {/* ── Buttons ── */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting || isPending}
            className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          >
            {isSubmitting || isPending ? "送信中..." : "確認する"}
          </Button>
          <BackButton className="w-full max-w-xs" />
        </div>
      </form>
    </div>
  );
}
