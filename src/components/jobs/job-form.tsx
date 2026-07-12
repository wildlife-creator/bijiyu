"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
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
  jobSchema,
  JOB_DATE_MIN,
  JOB_DATE_MAX,
  type JobFormValues,
} from "@/lib/validations/job";
import {
  uploadFilesDirect,
  // 案件画像は画像 + PDF (10MB) を許可するため書類用ルールを流用する
  DOCUMENT_UPLOAD_RULE_10MB,
} from "@/lib/storage/direct-upload";
import { MultiSelect } from "@/components/ui/multi-select";
import { MasterCombobox } from "@/components/master/master-combobox";
import { AreaListEditor } from "@/components/area/area-list-editor";
import type { AreaRow } from "@/components/area/types";
import {
  applyDeprecatedSuffix,
  stripDeprecatedSuffix,
} from "@/lib/master/deprecated";
import {
  EXPERIENCE_YEARS,
  LANGUAGES,
} from "@/lib/constants/options";
import { createJobAction, updateJobAction, deleteJobImageAction } from "@/app/(authenticated)/jobs/actions";
import { JobImageUploader } from "./job-image-uploader";

interface ExistingImage {
  id: string;
  imageUrl: string;
  imageType: string;
  sortOrder: number;
}

interface JobFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<JobFormValues>;
  existingImages?: ExistingImage[];
  jobId?: string;
  activeTradeTypes: string[];
  deprecatedTradeSet: string[];
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
  existingDeprecatedMunicipalitiesByPrefecture?: Record<string, string[]>;
}

// 数値入力のスピナー（上下矢印）を非表示にし、誤操作を防ぐ Tailwind ユーティリティ。
// カスタム CSS を増やさず arbitrary variant で完結させる。
const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

// マウスホイールによる値の誤変更（30000 → 30001 等）を防ぐ。
function blurOnWheel(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

// 公開バリデーション失敗時に「最初の不備箇所」へスクロールするための DOM 順序。
// 各フィールドのラッパーに data-field={name} を付与し、この順で先頭の不備を探す。
const FIELD_ORDER = [
  "title",
  "description",
  "rewardUpper",
  "rewardLower",
  "areas",
  "tradeTypes",
  "headcount",
  "projectStartDate",
  "projectEndDate",
  "workStartDate",
  "workEndDate",
  "recruitStartDate",
  "recruitEndDate",
  "ownerMessage",
] as const;

export function JobForm({
  mode,
  defaultValues,
  existingImages: initialExistingImages = [],
  jobId,
  activeTradeTypes,
  deprecatedTradeSet,
  candidateMunicipalitiesByPrefecture,
  existingDeprecatedMunicipalitiesByPrefecture,
}: JobFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // どのボタンを押したかを保持し、そのボタンにのみスピナーを出す。
  // （公開 / 下書き保存 / 更新 は同じ isPending を共有するため、
  //  これが無いと全ボタンが同時にスピナー表示になってしまう）
  const [pendingAction, setPendingAction] = useState<
    "publish" | "draft" | "update" | null
  >(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState(initialExistingImages);
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    shouldFocusError: true,
    defaultValues: {
      title: "",
      description: "",
      tradeTypes: [],
      rewardLower: undefined as unknown as number,
      rewardUpper: undefined as unknown as number,
      areas: [],
      projectStartDate: "",
      projectEndDate: "",
      workStartDate: "",
      workEndDate: "",
      recruitStartDate: "",
      recruitEndDate: "",
      headcount: undefined as unknown as number,
      workHours: "",
      experienceYears: "",
      requiredSkills: "",
      language: [],
      items: "",
      scheduleDetail: "",
      projectDetails: "",
      ownerMessage: "",
      status: "draft",
      ...defaultValues,
    },
  });

  const currentStatus = watch("status");

  const handleDeleteExisting = useCallback(
    async (imageId: string) => {
      if (!jobId) return;
      const formData = new FormData();
      formData.set("imageId", imageId);
      formData.set("jobId", jobId);
      const result = await deleteJobImageAction(formData);
      if (result.success) {
        setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
        toast.success("画像を削除しました");
      } else {
        toast.error(result.error);
      }
    },
    [jobId]
  );

  // バリデーション失敗時: 内部フィールド名を出さず単一行トースト + 最初の不備へスクロール
  // （会員登録フォームと同じ「各項目直下の赤字 + 先頭エラーへ誘導」方式）
  const onInvalid = useCallback((fieldErrors: FieldErrors<JobFormValues>) => {
    toast.error("入力内容に不備があります");
    const firstKey = FIELD_ORDER.find((key) => key in fieldErrors);
    if (firstKey) {
      const el = formRef.current?.querySelector<HTMLElement>(
        `[data-field="${firstKey}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  function onSubmit(data: JobFormValues) {
    const action =
      data.status === "draft" ? "draft" : mode === "edit" ? "update" : "publish";
    setPendingAction(action);
    startTransition(async () => {
      try {
        const formData = new FormData();

        // areas は AreaTuple[] のため JSON.stringify でシリアライズ
        // (Server Action 側で JSON.parse で復元)
        const { areas: areasData, ...restData } = data;
        formData.set("areas", JSON.stringify(areasData ?? []));

        // 残りのフィールド: 配列は append、それ以外は set
        Object.entries(restData).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (Array.isArray(value)) {
            for (const item of value) {
              formData.append(key, String(item));
            }
          } else {
            formData.set(key, String(value));
          }
        });

        // Add job ID for edit mode
        if (mode === "edit" && jobId) {
          formData.set("jobId", jobId);
        }

        // 画像はブラウザから Storage へ直接アップロードし、パスだけ渡す
        // (Server Action 経由の File 送信は Vercel の 4.5MB 上限で 413 になる)
        const uploaded = await uploadFilesDirect({
          bucket: "job-attachments",
          files: newFiles,
          rule: DOCUMENT_UPLOAD_RULE_10MB,
        });
        if (!uploaded.success) {
          toast.error(uploaded.error);
          return;
        }
        for (const path of uploaded.paths) {
          formData.append("imagePaths", path);
        }

        const result =
          mode === "create"
            ? await createJobAction(formData)
            : await updateJobAction(formData);

        if (result.success && result.data) {
          toast.success(
            mode === "create" ? "案件を作成しました" : "案件を更新しました"
          );
          router.push(`/jobs/${result.data.id}?manage=true`);
        } else if (!result.success) {
          toast.error(result.error);
        }
      } catch {
        // Server Action の呼び出し自体が失敗した場合 (通信断・413 等) も
        // 無反応にせず必ずユーザーに伝える
        toast.error(
          "保存に失敗しました。通信環境をご確認のうえ再度お試しください"
        );
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleSaveAsDraft() {
    // Skip client-side validation for draft save
    const values = watch() as JobFormValues;
    values.status = "draft";
    onSubmit(values);
  }

  function handlePublish() {
    // Trigger full validation via handleSubmit, then submit with status = open
    handleSubmit(
      (data) => {
        (data as JobFormValues).status = "open";
        onSubmit(data as JobFormValues);
      },
      onInvalid,
    )();
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      className="space-y-8"
    >
      {/* タイトル */}
      <div className="space-y-1" data-field="title">
        <Label>
          タイトル <span className="text-destructive">必須</span>
        </Label>
        <Input {...register("title")} placeholder="案件タイトルを入力" />
        {errors.title && (
          <p className="text-body-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      {/* 案件詳細 */}
      <div className="space-y-1" data-field="description">
        <Label>
          案件詳細 <span className="text-destructive">必須</span>
        </Label>
        <Textarea
          {...register("description")}
          placeholder="案件の詳細を入力"
          rows={4}
        />
        {errors.description && (
          <p className="text-body-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Section: 条件 */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">条件</h2>

        {/* 報酬上限（人工） */}
        <div className="space-y-1" data-field="rewardUpper">
          <Label>
            報酬上限（人工） <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className={NUMBER_INPUT_CLASS}
              onWheel={blurOnWheel}
              {...register("rewardUpper", { valueAsNumber: true })}
              placeholder="上限"
            />
            <span className="shrink-0 text-body-md">円</span>
          </div>
          {errors.rewardUpper && (
            <p className="text-body-sm text-destructive">
              {errors.rewardUpper.message}
            </p>
          )}
        </div>

        {/* 報酬下限（人工） */}
        <div className="space-y-1" data-field="rewardLower">
          <Label>報酬下限（人工）</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className={NUMBER_INPUT_CLASS}
              onWheel={blurOnWheel}
              {...register("rewardLower", { valueAsNumber: true })}
              placeholder="下限"
            />
            <span className="shrink-0 text-body-md">円</span>
          </div>
          {errors.rewardLower && (
            <p className="text-body-sm text-destructive">
              {errors.rewardLower.message}
            </p>
          )}
        </div>

        {/* エリア (1案件最大 10 件、県跨ぎ可、市区町村未指定 = 全域/現場未定 可) */}
        <div className="space-y-1" data-field="areas">
          <Label>
            エリア <span className="text-destructive">必須</span>
          </Label>
          <AreaListEditor
            value={(watch("areas") as AreaRow[] | undefined) ?? []}
            onChange={(next) =>
              setValue("areas", next, { shouldValidate: true })
            }
            candidateMunicipalitiesByPrefecture={
              candidateMunicipalitiesByPrefecture
            }
            existingDeprecatedMunicipalitiesByPrefecture={
              existingDeprecatedMunicipalitiesByPrefecture
            }
            requireInitialRow
          />
          {errors.areas && (
            <p className="text-body-sm text-destructive">
              {errors.areas.message ?? "エリアの入力に不備があります"}
            </p>
          )}
        </div>

        {/* 募集職種 (MasterCombobox multi, 1 件以上必須 / 下書きは 0 件可) */}
        <div className="space-y-1" data-field="tradeTypes">
          <Label>
            募集職種 <span className="text-destructive">必須</span>
          </Label>
          <MasterCombobox
            mode="multi"
            options={activeTradeTypes}
            value={applyDeprecatedSuffix(
              watch("tradeTypes") ?? [],
              new Set(deprecatedTradeSet),
            )}
            onChange={(next) =>
              setValue("tradeTypes", next.map(stripDeprecatedSuffix), {
                shouldValidate: true,
              })
            }
            placeholder="募集職種を検索"
            emptyLabel="候補がありません"
            disabled={isPending}
          />
          {errors.tradeTypes && (
            <p className="text-body-sm text-destructive">
              {errors.tradeTypes.message}
            </p>
          )}
        </div>

        {/* 募集人数 */}
        <div className="space-y-1" data-field="headcount">
          <Label>
            募集人数（人） <span className="text-destructive">必須</span>
          </Label>
          <Input
            type="number"
            className={NUMBER_INPUT_CLASS}
            onWheel={blurOnWheel}
            {...register("headcount", { valueAsNumber: true })}
            placeholder="人数"
          />
          {errors.headcount && (
            <p className="text-body-sm text-destructive">
              {errors.headcount.message}
            </p>
          )}
        </div>

        {/* 工事全体の工期（任意） */}
        <div className="space-y-1">
          <Label>工事全体の工期</Label>
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1" data-field="projectStartDate">
              <Input
                type="date"
                min={JOB_DATE_MIN}
                max={JOB_DATE_MAX}
                {...register("projectStartDate")}
              />
              {errors.projectStartDate && (
                <p className="text-body-sm text-destructive">
                  {errors.projectStartDate.message}
                </p>
              )}
            </div>
            <span className="mt-2 text-body-md">〜</span>
            <div className="flex-1 space-y-1" data-field="projectEndDate">
              <Input
                type="date"
                min={JOB_DATE_MIN}
                max={JOB_DATE_MAX}
                {...register("projectEndDate")}
              />
              {errors.projectEndDate && (
                <p className="text-body-sm text-destructive">
                  {errors.projectEndDate.message}
                </p>
              )}
            </div>
          </div>
          <p className="text-body-xs text-muted-foreground">
            工事プロジェクト全体の期間です（着工〜竣工の予定）
          </p>
        </div>

        {/* 稼働期間 */}
        <div className="space-y-1">
          <Label>
            稼働期間 <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1" data-field="workStartDate">
              <Input
                type="date"
                min={JOB_DATE_MIN}
                max={JOB_DATE_MAX}
                {...register("workStartDate")}
              />
              {errors.workStartDate && (
                <p className="text-body-sm text-destructive">
                  {errors.workStartDate.message}
                </p>
              )}
            </div>
            <span className="mt-2 text-body-md">〜</span>
            <div className="flex-1 space-y-1" data-field="workEndDate">
              <Input
                type="date"
                min={JOB_DATE_MIN}
                max={JOB_DATE_MAX}
                {...register("workEndDate")}
              />
              {errors.workEndDate && (
                <p className="text-body-sm text-destructive">
                  {errors.workEndDate.message}
                </p>
              )}
            </div>
          </div>
          <p className="text-body-xs text-muted-foreground">
            募集する職人の方に実際に働いてもらう期間です
          </p>
        </div>

        {/* 応募受付期間 */}
        <div className="space-y-1">
          <Label>
            応募受付期間 <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1" data-field="recruitStartDate">
              <Input
                type="date"
                min={JOB_DATE_MIN}
                max={JOB_DATE_MAX}
                {...register("recruitStartDate")}
              />
              {errors.recruitStartDate && (
                <p className="text-body-sm text-destructive">
                  {errors.recruitStartDate.message}
                </p>
              )}
            </div>
            <span className="mt-2 text-body-md">〜</span>
            <div className="flex-1 space-y-1" data-field="recruitEndDate">
              <Input
                type="date"
                min={JOB_DATE_MIN}
                max={JOB_DATE_MAX}
                {...register("recruitEndDate")}
              />
              {errors.recruitEndDate && (
                <p className="text-body-sm text-destructive">
                  {errors.recruitEndDate.message}
                </p>
              )}
            </div>
          </div>
          <p className="text-body-xs text-muted-foreground">
            応募を受け付ける期間です。終了日がそのまま応募締め切りになります
          </p>
        </div>

        {/* 稼働時間（任意） */}
        <div className="space-y-1">
          <Label>稼働時間</Label>
          <Input
            {...register("workHours")}
            placeholder="例: 8:00〜17:00"
          />
        </div>

        {/* 応募締め切り（= 応募受付期間の終了日と同じ値を表示用に表示） */}
        <div className="space-y-1">
          <Label>
            応募締め切り <span className="text-destructive">必須</span>
          </Label>
          <Input
            type="date"
            value={watch("recruitEndDate") || ""}
            disabled
            className="bg-muted"
          />
          <p className="text-body-xs text-muted-foreground">
            応募受付期間の終了日が自動的に設定されます
          </p>
        </div>

        {/* 経験年数 */}
        <div className="space-y-1">
          <Label>経験年数</Label>
          <Select
            value={watch("experienceYears") || ""}
            onValueChange={(v) => setValue("experienceYears", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {EXPERIENCE_YEARS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 必須スキル */}
        <div className="space-y-1">
          <Label>必須スキル</Label>
          <Input
            {...register("requiredSkills")}
            placeholder="テキスト"
          />
        </div>

        {/* 言語 */}
        <div className="space-y-1">
          <Label>言語</Label>
          <MultiSelect
            options={LANGUAGES}
            value={watch("language") ?? []}
            onChange={(next) => setValue("language", next)}
            placeholder="お選びください"
          />
        </div>

        {/* 持ち物 */}
        <div className="space-y-1">
          <Label>持ち物</Label>
          <Input
            {...register("items")}
            placeholder="例: 作業着、安全靴、ヘルメット、安全帯（ハーネス型）、腰道具"
          />
        </div>
      </section>

      {/* Section: 業務内容 */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">業務内容</h2>

        {/* スケジュール詳細 */}
        <div className="space-y-1">
          <Label>スケジュール詳細</Label>
          <Textarea
            {...register("scheduleDetail")}
            placeholder="スケジュールの詳細を入力"
            rows={4}
          />
        </div>

        {/* 請負案件詳細 */}
        <div className="space-y-1">
          <Label>請負案件詳細</Label>
          <Textarea
            {...register("projectDetails")}
            placeholder="請負案件の詳細を入力"
            rows={4}
          />
        </div>
      </section>

      {/* その他 */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">その他</h2>

        {/* 発注者からのメッセージ */}
        <div className="space-y-1" data-field="ownerMessage">
          <Label>
            発注者からのメッセージ <span className="text-destructive">必須</span>
          </Label>
          <Textarea
            {...register("ownerMessage")}
            placeholder="応募者へのメッセージを入力"
            rows={3}
          />
          {errors.ownerMessage && (
            <p className="text-body-sm text-destructive">
              {errors.ownerMessage.message}
            </p>
          )}
        </div>
      </section>

      {/* Section: 画像 */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">画像</h2>
        <p className="text-body-sm text-muted-foreground">
          1枚目の画像が案件一覧のサムネイルとして表示されます（写真を1枚目にしてください）。JPEG・PNG・WebP・PDF、iPhoneのHEIC写真も可。最大10枚まで、1枚あたり10MBまで。
        </p>
        <JobImageUploader
          existingImages={existingImages}
          newFiles={newFiles}
          onFilesChange={setNewFiles}
          onDeleteExisting={mode === "edit" ? handleDeleteExisting : undefined}
        />
      </section>

      {/* Submit buttons */}
      <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
        {mode === "create" && (
          <>
            <Button
              type="button"
              className="w-full rounded-pill text-body-md border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
              pending={pendingAction === "publish"}
              onClick={handlePublish}
            >
              公開する
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-pill text-body-md border-secondary text-secondary"
              disabled={isPending}
              pending={pendingAction === "draft"}
              onClick={handleSaveAsDraft}
            >
              下書き保存
            </Button>
          </>
        )}

        {mode === "edit" && currentStatus === "draft" && (
          <>
            <Button
              type="button"
              className="w-full rounded-pill text-body-md border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
              pending={pendingAction === "publish"}
              onClick={handlePublish}
            >
              公開する
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-pill text-body-md border-secondary text-secondary"
              disabled={isPending}
              pending={pendingAction === "draft"}
              onClick={handleSaveAsDraft}
            >
              下書き保存
            </Button>
          </>
        )}

        {mode === "edit" && currentStatus !== "draft" && (
          <Button
            type="submit"
            className="w-full rounded-pill text-body-md border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isPending}
            pending={pendingAction === "update"}
          >
            更新する
          </Button>
        )}

        <BackButton />
      </div>

      <input type="hidden" {...register("status")} />
    </form>
  );
}
