"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useTransition,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/shared/back-button";
import { MasterCombobox } from "@/components/master/master-combobox";
import { RelatedSuggestions } from "@/components/master/related-suggestions";
import { AreaListEditor } from "@/components/area/area-list-editor";
import { ResidencePicker } from "@/components/area/residence-picker";
import type { AreaRow } from "@/components/area/types";
import { collapseAreasFromDb } from "@/lib/master/area-conversion";
import {
  applyDeprecatedSuffix,
  stripDeprecatedSuffix,
} from "@/lib/master/deprecated";
import { GENDERS } from "@/lib/constants/options";
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

interface ProfileEditFormProps {
  activeTradeTypes: string[];
  activeQualifications: string[];
  activeSkillTags: string[];
  /** マスタで deprecated_at IS NOT NULL の label 一覧（chip 表示時のみサフィックス付与） */
  deprecatedTradeSet: string[];
  deprecatedQualSet: string[];
  deprecatedTagSet: string[];
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
  municipalitySortOrderMap: Record<string, Record<string, number>>;
  existingDeprecatedMunicipalitiesByPrefecture?: Record<string, string[]>;
}

export function ProfileEditForm({
  activeTradeTypes,
  activeQualifications,
  activeSkillTags,
  deprecatedTradeSet,
  deprecatedQualSet,
  deprecatedTagSet,
  candidateMunicipalitiesByPrefecture,
  municipalitySortOrderMap,
  existingDeprecatedMunicipalitiesByPrefecture,
}: ProfileEditFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [lastPickedTrade, setLastPickedTrade] = useState<string | null>(null);
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
      municipality: "",
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
  const watchedSkills = watch("skills");
  const watchedGender = watch("gender");
  const watchedPrefecture = watch("prefecture");
  const watchedMunicipality = watch("municipality");

  const handleResidenceChange = useCallback(
    (next: { prefecture: string; municipality: string | null }) => {
      setValue("prefecture", next.prefecture, { shouldValidate: true });
      setValue("municipality", next.municipality ?? "", {
        shouldValidate: true,
      });
    },
    [setValue],
  );

  const handleAreaChange = useCallback(
    (next: AreaRow[]) => {
      setValue("availableAreas", next, { shouldValidate: true });
      // 一度保存ボタンを押してエラーが出た後、ユーザーがエリアを修正したら
      // すぐにエラー表示を消す。
      setValidationErrors((prev) => {
        if (!prev["availableAreas"]) return prev;
        const updated = { ...prev };
        delete updated["availableAreas"];
        return updated;
      });
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
          "last_name, first_name, gender, birth_date, prefecture, municipality, company_name, bio, avatar_url, skill_tags",
        )
        .eq("id", user.id)
        .single();

      const { data: userSkills } = await supabase
        .from("user_skills")
        .select("trade_type, experience_years")
        .eq("user_id", user.id);

      const { data: userAreas } = await supabase
        .from("user_available_areas")
        .select("prefecture, municipality")
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

        const areaPairs = userAreas
          ? userAreas.map((a: { prefecture: string; municipality: string | null }) => ({
              prefecture: a.prefecture,
              municipality: a.municipality,
            }))
          : [];
        const areas = collapseAreasFromDb(areaPairs, municipalitySortOrderMap);

        const qualifications = userQualifications
          ? userQualifications.map(
              (q: { qualification_name: string }) => q.qualification_name,
            )
          : [];

        reset({
          lastName: profile.last_name ?? "",
          firstName: profile.first_name ?? "",
          gender: profile.gender ?? "",
          // DB はハイフン(YYYY-MM-DD)だが、入力 UI は半角スラッシュ表示で統一する
          // （登録時のスラッシュ入力と見た目を合わせる。保存時に再度ハイフンへ正規化）
          birthDate: (profile.birth_date ?? "").replaceAll("-", "/"),
          email: user.email ?? "",
          prefecture: profile.prefecture ?? "",
          municipality: profile.municipality ?? "",
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
    // municipalitySortOrderMap は Server Component から注入される stable prop。
    // mount 時に 1 度だけ読込めば十分なので deps から除外する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 各行で MasterCombobox を呼ぶ際、他の行で既選択の trade_type を候補から除外する
  const selectedTradeTypes = useMemo(() => {
    return (watchedSkills ?? [])
      .map((s) => s?.tradeType ?? "")
      .filter((t): t is string => t.length > 0);
  }, [watchedSkills]);

  const tradeOptionsForRow = useCallback(
    (rowValue: string) => {
      const others = new Set(selectedTradeTypes.filter((t) => t !== rowValue));
      return activeTradeTypes.filter((opt) => !others.has(opt));
    },
    [selectedTradeTypes, activeTradeTypes],
  );

  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    setValidationErrors({});

    const raw = getValues();
    // 「（廃止）」サフィックスを保存前に取り除く
    const data: ProfileEditInput = {
      ...raw,
      skills: raw.skills.map((s) => ({
        ...s,
        tradeType: stripDeprecatedSuffix(s.tradeType),
      })),
      skillTags: (raw.skillTags ?? []).map(stripDeprecatedSuffix),
      qualifications: (raw.qualifications ?? []).map(stripDeprecatedSuffix),
    };

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
    formData.append("municipality", parsed.data.municipality ?? "");
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
                type="text"
                inputMode="numeric"
                placeholder="例: 1990/01/15"
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
            </FieldGroup>

            {/* お住まい（都道府県 + 市区町村1つ。市区町村は任意） */}
            <FieldGroup>
              <FieldLabel htmlFor="residencePrefecture">
                お住まい
                <RequiredBadge />
              </FieldLabel>
              <ResidencePicker
                prefectureId="residencePrefecture"
                value={{
                  prefecture: watchedPrefecture ?? "",
                  municipality: watchedMunicipality || null,
                }}
                onChange={handleResidenceChange}
                candidateMunicipalitiesByPrefecture={
                  candidateMunicipalitiesByPrefecture
                }
                disabled={isPending}
              />
              <FieldError message={validationErrors["prefecture"]} />
            </FieldGroup>

            {/* 対応可能エリア — 都道府県 + 市区町村の階層プルダウン */}
            <FieldGroup>
              <FieldLabel>
                対応可能エリア
                <RequiredBadge />
              </FieldLabel>
              <AreaListEditor
                value={watchedAreas ?? []}
                onChange={handleAreaChange}
                candidateMunicipalitiesByPrefecture={
                  candidateMunicipalitiesByPrefecture
                }
                existingDeprecatedMunicipalitiesByPrefecture={
                  existingDeprecatedMunicipalitiesByPrefecture
                }
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
                {fields.map((field, index) => {
                  const rowValue = watch(`skills.${index}.tradeType`) ?? "";
                  const valueArr = rowValue ? [rowValue] : [];
                  const valueWithSuffix = applyDeprecatedSuffix(
                    valueArr,
                    new Set(deprecatedTradeSet),
                  );
                  return (
                    <div key={field.id} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <MasterCombobox
                          mode="single"
                          options={tradeOptionsForRow(rowValue)}
                          value={valueWithSuffix}
                          onChange={(next) => {
                            const picked = stripDeprecatedSuffix(next[0] ?? "");
                            setValue(`skills.${index}.tradeType`, picked, {
                              shouldValidate: true,
                            });
                            if (picked) {
                              setLastPickedTrade(picked);
                            }
                          }}
                          singleTriggerLabel="職種を選択"
                          placeholder="職種を検索"
                          emptyLabel="候補がありません"
                          disabled={isPending}
                        />
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
                  );
                })}
                <FieldError message={validationErrors["skills"]} />
                <RelatedSuggestions
                  pickedTrade={lastPickedTrade}
                  allActiveTradeTypes={activeTradeTypes}
                  alreadySelected={selectedTradeTypes}
                  onPick={(picked) => {
                    append({ tradeType: picked, experienceYears: 0 });
                    setLastPickedTrade(picked);
                  }}
                  onDismiss={() => setLastPickedTrade(null)}
                />
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
              </div>
            </FieldGroup>

            {/* 保有スキル */}
            <FieldGroup>
              <FieldLabel>保有スキル</FieldLabel>
              <p className="text-body-xs text-muted-foreground">
                得意とする工種・作業内容を追加できます（例: 型枠設置、電気工、送配電線工）
              </p>
              <MasterCombobox
                mode="multi"
                options={activeSkillTags}
                value={applyDeprecatedSuffix(
                  watchedSkillTags ?? [],
                  new Set(deprecatedTagSet),
                )}
                onChange={(next) =>
                  setValue(
                    "skillTags",
                    next.map(stripDeprecatedSuffix),
                    { shouldValidate: true },
                  )
                }
                placeholder="スキルを検索"
                emptyLabel="候補がありません"
                disabled={isPending}
              />
            </FieldGroup>

            {/* 保有資格 */}
            <FieldGroup>
              <FieldLabel>保有資格</FieldLabel>
              <MasterCombobox
                mode="multi"
                options={activeQualifications}
                value={applyDeprecatedSuffix(
                  watchedQualifications ?? [],
                  new Set(deprecatedQualSet),
                )}
                onChange={(next) =>
                  setValue(
                    "qualifications",
                    next.map(stripDeprecatedSuffix),
                    { shouldValidate: true },
                  )
                }
                placeholder="資格名を検索"
                emptyLabel="候補がありません"
                disabled={isPending}
              />
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
            {isSubmitting || isPending ? "送信中..." : "保存する"}
          </Button>
          <BackButton className="w-full max-w-xs" />
        </div>
      </form>
    </div>
  );
}
