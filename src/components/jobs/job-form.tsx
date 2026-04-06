"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { jobSchema, type JobFormValues } from "@/lib/validations/job";
import { TRADE_TYPES, PREFECTURES } from "@/lib/constants/options";
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
}

export function JobForm({
  mode,
  defaultValues,
  existingImages: initialExistingImages = [],
  jobId,
}: JobFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState(initialExistingImages);

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
      tradeType: "",
      rewardLower: undefined as unknown as number,
      rewardUpper: undefined as unknown as number,
      prefecture: "",
      address: "",
      workStartDate: "",
      workEndDate: "",
      recruitStartDate: "",
      recruitEndDate: "",
      headcount: undefined as unknown as number,
      workHours: "",
      experienceYears: "",
      requiredSkills: "",
      nationalityLanguage: "",
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

  function onSubmit(data: JobFormValues) {
    startTransition(async () => {
      const formData = new FormData();

      // Add all fields
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.set(key, String(value));
        }
      });

      // Add job ID for edit mode
      if (mode === "edit" && jobId) {
        formData.set("jobId", jobId);
      }

      // Add image files
      for (const file of newFiles) {
        formData.append("images", file);
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
    });
  }

  function handleSaveAsDraft() {
    // Skip client-side validation for draft save
    const values = watch();
    values.status = "draft";
    onSubmit(values);
  }

  function handlePublish() {
    // Trigger full validation via handleSubmit, then submit with status = open
    handleSubmit(
      (data) => {
        data.status = "open";
        onSubmit(data);
      },
      (fieldErrors) => {
        const errorFields = Object.entries(fieldErrors)
          .map(([key, err]) => `${key}: ${err?.message}`)
          .join(", ");
        toast.error(`入力内容に不備があります: ${errorFields}`);
      },
    )();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* タイトル */}
      <div className="space-y-1">
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
      <div className="space-y-1">
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
        <div className="space-y-1">
          <Label>
            報酬上限（人工） <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
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
        <div className="space-y-1">
          <Label>報酬下限（人工）</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
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

        {/* エリア */}
        <div className="space-y-1">
          <Label>
            エリア <span className="text-destructive">必須</span>
          </Label>
          <Select
            value={watch("prefecture")}
            onValueChange={(v) => setValue("prefecture", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {PREFECTURES.map((pref) => (
                <SelectItem key={pref} value={pref}>
                  {pref}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.prefecture && (
            <p className="text-body-sm text-destructive">
              {errors.prefecture.message}
            </p>
          )}
        </div>

        {/* 募集職種 */}
        <div className="space-y-1">
          <Label>
            募集職種 <span className="text-destructive">必須</span>
          </Label>
          <Select
            value={watch("tradeType")}
            onValueChange={(v) => setValue("tradeType", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {TRADE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.tradeType && (
            <p className="text-body-sm text-destructive">
              {errors.tradeType.message}
            </p>
          )}
        </div>

        {/* 募集人数 */}
        <div className="space-y-1">
          <Label>
            募集人数（人） <span className="text-destructive">必須</span>
          </Label>
          <Input
            type="number"
            {...register("headcount", { valueAsNumber: true })}
            placeholder="人数"
          />
          {errors.headcount && (
            <p className="text-body-sm text-destructive">
              {errors.headcount.message}
            </p>
          )}
        </div>

        {/* 現場工期 */}
        <div className="space-y-1">
          <Label>
            現場工期 <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input type="date" {...register("workStartDate")} />
            <span className="text-body-md">〜</span>
            <Input type="date" {...register("workEndDate")} />
          </div>
          {errors.workStartDate && (
            <p className="text-body-sm text-destructive">
              {errors.workStartDate.message}
            </p>
          )}
          {errors.workEndDate && (
            <p className="text-body-sm text-destructive">
              {errors.workEndDate.message}
            </p>
          )}
        </div>

        {/* 募集期間 */}
        <div className="space-y-1">
          <Label>
            募集期間 <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input type="date" {...register("recruitStartDate")} />
            <span className="text-body-md">〜</span>
            <Input type="date" {...register("recruitEndDate")} />
          </div>
          {errors.recruitStartDate && (
            <p className="text-body-sm text-destructive">
              {errors.recruitStartDate.message}
            </p>
          )}
          {errors.recruitEndDate && (
            <p className="text-body-sm text-destructive">
              {errors.recruitEndDate.message}
            </p>
          )}
        </div>

        {/* 稼働時間 */}
        <div className="space-y-1">
          <Label>
            稼働時間 <span className="text-destructive">必須</span>
          </Label>
          <Input
            {...register("workHours")}
            placeholder="例: 8:00〜17:00"
          />
        </div>

        {/* 締め切り（= 募集終了日と同じ値を表示用に表示） */}
        <div className="space-y-1">
          <Label>
            締め切り <span className="text-destructive">必須</span>
          </Label>
          <Input
            type="date"
            value={watch("recruitEndDate") || ""}
            disabled
            className="bg-muted"
          />
          <p className="text-body-xs text-muted-foreground">
            募集期間の終了日が自動的に設定されます
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
              <SelectItem value="不問">不問</SelectItem>
              <SelectItem value="1年以上">1年以上</SelectItem>
              <SelectItem value="3年以上">3年以上</SelectItem>
              <SelectItem value="5年以上">5年以上</SelectItem>
              <SelectItem value="10年以上">10年以上</SelectItem>
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

        {/* 国籍・言語 */}
        <div className="space-y-1">
          <Label>国籍・言語</Label>
          <Select
            value={watch("nationalityLanguage") || ""}
            onValueChange={(v) => setValue("nationalityLanguage", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="不問">不問</SelectItem>
              <SelectItem value="日本語必須">日本語必須</SelectItem>
              <SelectItem value="日本国籍のみ">日本国籍のみ</SelectItem>
            </SelectContent>
          </Select>
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
        <div className="space-y-1">
          <Label>
            発注者からのメッセージ <span className="text-destructive">必須</span>
          </Label>
          <Textarea
            {...register("ownerMessage")}
            placeholder="応募者へのメッセージを入力"
            rows={3}
          />
        </div>
      </section>

      {/* Section: 画像 */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">画像</h2>
        <p className="text-body-sm text-muted-foreground">
          1枚目の画像が案件一覧のサムネイルとして表示されます。最大10枚までアップロードできます。
        </p>
        <JobImageUploader
          existingImages={existingImages}
          newFiles={newFiles}
          onFilesChange={setNewFiles}
          onDeleteExisting={mode === "edit" ? handleDeleteExisting : undefined}
        />
      </section>

      {/* Submit buttons */}
      <div className="space-y-3">
        {mode === "create" && (
          <>
            <Button
              type="button"
              className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
              onClick={handlePublish}
            >
              {isPending ? "処理中..." : "公開する"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-[47px] border-secondary text-secondary"
              disabled={isPending}
              onClick={handleSaveAsDraft}
            >
              {isPending ? "処理中..." : "下書き保存"}
            </Button>
          </>
        )}

        {mode === "edit" && currentStatus === "draft" && (
          <>
            <Button
              type="button"
              className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
              onClick={handlePublish}
            >
              {isPending ? "処理中..." : "公開する"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-[47px] border-secondary text-secondary"
              disabled={isPending}
              onClick={handleSaveAsDraft}
            >
              {isPending ? "処理中..." : "下書き保存"}
            </Button>
          </>
        )}

        {mode === "edit" && currentStatus !== "draft" && (
          <Button
            type="submit"
            className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isPending}
          >
            {isPending ? "処理中..." : "更新する"}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full rounded-[47px] border-secondary text-secondary"
          onClick={() => router.back()}
        >
          もどる
        </Button>
      </div>

      <input type="hidden" {...register("status")} />
    </form>
  );
}
