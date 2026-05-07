"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/shared/back-button";
import { LANGUAGES, PREFECTURES, TRADE_TYPES } from "@/lib/constants/options";
import {
  clientProfilePersonalSchema,
  clientProfileSchema,
  type ClientProfileFormInput,
} from "@/lib/validations/client-profile";

import {
  saveClientProfileAction,
  uploadClientProfileImageAction,
} from "../actions";

type PlanType = "individual" | "small" | "corporate" | "corporate_premium";

interface Props {
  planType: PlanType | null;
  initialValues: ClientProfileFormInput;
  mode: "edit" | "setup";
}

const SNS_FIELDS = [
  { key: "snsX" as const, label: "X" },
  { key: "snsInstagram" as const, label: "Instagram" },
  { key: "snsTiktok" as const, label: "TikTok" },
  { key: "snsYoutube" as const, label: "YouTube" },
  { key: "snsFacebook" as const, label: "Facebook" },
];

function RequiredBadge() {
  return (
    <span className="ml-2 text-body-xs font-bold text-destructive">必須</span>
  );
}

export function ClientProfileEditForm({ planType, initialValues, mode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(
    initialValues.imageUrl ?? null,
  );

  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";
  const schema = isCorporate ? clientProfileSchema : clientProfilePersonalSchema;
  const isSetup = mode === "setup";

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ClientProfileFormInput>({
    // schema は法人/個人で動的に切り替わり、preprocess + transform で
    // 入力型（unknown 多数）と出力型（ClientProfileFormInput）が乖離する。
    // 入出力ともに ClientProfileFormInput として扱う（runtime は変わらない）。
    resolver: zodResolver(schema) as unknown as Resolver<ClientProfileFormInput>,
    defaultValues: initialValues,
  });

  const setupBannerText = useMemo(() => {
    if (!isSetup) return null;
    if (isCorporate) {
      return "プラン登録が完了しました。社名の入力が必須です（後からいつでも編集できます）";
    }
    return "プラン登録が完了しました。発注者として利用する場合は社名または氏名を入力してください。受注者機能のみ利用する方はスキップ可（後からいつでも編集できます）";
  }, [isSetup, isCorporate]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("image", file);
    startUpload(async () => {
      const result = await uploadClientProfileImageAction(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setImageUrl(result.data?.imageUrl ?? null);
      toast.success("画像をアップロードしました");
    });
    e.target.value = "";
  }

  function onSubmit(values: ClientProfileFormInput) {
    startTransition(async () => {
      const payload: ClientProfileFormInput = {
        ...values,
        imageUrl: imageUrl ?? null,
      };
      const result = await saveClientProfileAction(payload, { mode });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("発注者情報を保存しました");
      const redirectTo = result.data?.redirectTo ?? "/mypage/client-profile";
      // Router Cache 回避のためハードナビゲーション
      window.location.href = redirectTo;
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await saveClientProfileAction(
        { ...initialValues, imageUrl: imageUrl ?? null },
        { mode: "setup", skip: true },
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.data?.redirectTo ?? "/mypage";
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {setupBannerText && (
        <div className="rounded-[8px] border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-body-sm text-foreground">{setupBannerText}</p>
        </div>
      )}

      <section>
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>

        {/* プロフィール画像 */}
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="size-24 overflow-hidden rounded-full border border-border bg-background">
            {imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt="プロフィール画像"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <img
                  src="/images/icons/icon-avatar.png"
                  alt=""
                  className="size-8 opacity-40"
                />
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-pill"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "アップロード中..." : "画像を登録する"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={handleImageChange}
          />
        </div>
      </section>

      {/* 会社名・氏名 */}
      <FieldGroup>
        <FieldLabel htmlFor="displayName">
          会社名・氏名
          {isCorporate && <RequiredBadge />}
        </FieldLabel>
        <Input
          id="displayName"
          placeholder="○○株式会社"
          className="bg-background"
          {...register("displayName")}
          disabled={isPending}
        />
        <FieldError message={errors.displayName?.message} />
      </FieldGroup>

      {/* 住所 */}
      <FieldGroup>
        <FieldLabel htmlFor="address">住所</FieldLabel>
        <Input
          id="address"
          placeholder="東京都墨田区○○XX-X-XX"
          className="bg-background"
          {...register("address")}
          disabled={isPending}
        />
        <FieldError message={errors.address?.message} />
      </FieldGroup>

      {/* 募集職種 — 複数選択可能なプルダウン */}
      <FieldGroup>
        <FieldLabel htmlFor="recruitJobTypes">
          募集職種
          <RequiredBadge />
        </FieldLabel>
        <Controller
          control={control}
          name="recruitJobTypes"
          render={({ field }) => (
            <MultiSelect
              id="recruitJobTypes"
              options={TRADE_TYPES}
              value={field.value ?? []}
              onChange={field.onChange}
              disabled={isPending}
              placeholder="お選びください"
            />
          )}
        />
        <FieldError message={errors.recruitJobTypes?.message} />
      </FieldGroup>

      {/* 募集エリア — 複数選択可能なプルダウン */}
      <FieldGroup>
        <FieldLabel htmlFor="recruitArea">
          募集エリア
          <RequiredBadge />
        </FieldLabel>
        <Controller
          control={control}
          name="recruitArea"
          render={({ field }) => (
            <MultiSelect
              id="recruitArea"
              options={PREFECTURES}
              value={field.value ?? []}
              onChange={field.onChange}
              disabled={isPending}
              placeholder="お選びください"
            />
          )}
        />
        <FieldError message={errors.recruitArea?.message} />
      </FieldGroup>

      {/* 従業員規模 */}
      <FieldGroup>
        <FieldLabel htmlFor="employeeScale">従業員規模（人）</FieldLabel>
        <Input
          id="employeeScale"
          type="number"
          min={1}
          placeholder="100"
          className="bg-background"
          {...register("employeeScale", { valueAsNumber: true })}
          disabled={isPending}
        />
        <FieldError message={errors.employeeScale?.message} />
      </FieldGroup>

      {/* 求める働き方 */}
      <FieldGroup>
        <FieldLabel htmlFor="workingWay">求める働き方</FieldLabel>
        <Input
          id="workingWay"
          placeholder="例: 1日から可、長期歓迎"
          className="bg-background"
          {...register("workingWay")}
          disabled={isPending}
        />
        <FieldError message={errors.workingWay?.message} />
      </FieldGroup>

      {/* 言語 — 複数選択可能なプルダウン（DB は「、」区切り text で保存） */}
      <FieldGroup>
        <FieldLabel htmlFor="language">言語</FieldLabel>
        <Controller
          control={control}
          name="language"
          render={({ field }) => {
            // 既存データの互換: 「、」「・」「,」のいずれでも分割してロード
            const arrayValue = field.value
              ? field.value
                  .split(/[、・,]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            return (
              <MultiSelect
                id="language"
                options={LANGUAGES}
                value={arrayValue}
                onChange={(next) =>
                  field.onChange(next.length > 0 ? next.join("、") : null)
                }
                disabled={isPending}
                placeholder="お選びください"
              />
            );
          }}
        />
        <FieldError message={errors.language?.message} />
      </FieldGroup>

      {/* メッセージ */}
      <FieldGroup>
        <FieldLabel htmlFor="message">メッセージ</FieldLabel>
        <Textarea
          id="message"
          rows={6}
          className="bg-background"
          {...register("message")}
          disabled={isPending}
        />
        <FieldError message={errors.message?.message} />
      </FieldGroup>

      {/* 利用 SNS — CON-001-design-pc/sp.png を参考にしたチップ型選択 */}
      <section>
        <h2 className="text-body-lg font-bold text-foreground">利用SNS</h2>
        <p className="mt-1 text-body-xs text-muted-foreground">
          ※ 運営上の集計等のみに使用し、webアプリ上に表示はされません
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SNS_FIELDS.map(({ key, label }) => (
            <Controller
              key={key}
              control={control}
              name={key}
              render={({ field }) => {
                const checked = !!field.value;
                return (
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2.5 transition-colors ${
                      checked
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => field.onChange(v === true)}
                      disabled={isPending}
                    />
                    <span
                      className={`text-body-sm font-medium ${
                        checked ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {label}
                    </span>
                  </label>
                );
              }}
            />
          ))}
        </div>
      </section>

      {/* ボタン群 */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <Button
          type="submit"
          size="lg"
          className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          disabled={isPending}
        >
          {isSetup ? "保存する" : "確認する"}
        </Button>
        {isSetup && !isCorporate && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full max-w-xs rounded-pill"
            onClick={handleSkip}
            disabled={isPending}
          >
            スキップして後で設定する
          </Button>
        )}
        <BackButton className="w-full max-w-xs" />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

