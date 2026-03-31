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
      location: "",
      etcMessage: "",
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
        router.push(`/jobs/${result.data.id}`);
      } else if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  function handleSaveAsDraft() {
    setValue("status", "draft");
  }

  function handlePublish() {
    setValue("status", "open");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Section: 募集内容 */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">募集内容</h2>

        {/* Title */}
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

        {/* Trade type */}
        <div className="space-y-1">
          <Label>
            職種 <span className="text-destructive">必須</span>
          </Label>
          <Select
            value={watch("tradeType")}
            onValueChange={(v) => setValue("tradeType", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="職種を選択" />
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

        {/* Reward */}
        <div className="space-y-1">
          <Label>
            報酬（人工） <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              {...register("rewardLower", { valueAsNumber: true })}
              placeholder="下限"
            />
            <span className="text-body-md">〜</span>
            <Input
              type="number"
              {...register("rewardUpper", { valueAsNumber: true })}
              placeholder="上限"
            />
            <span className="shrink-0 text-body-md">円</span>
          </div>
          {errors.rewardLower && (
            <p className="text-body-sm text-destructive">
              {errors.rewardLower.message}
            </p>
          )}
          {errors.rewardUpper && (
            <p className="text-body-sm text-destructive">
              {errors.rewardUpper.message}
            </p>
          )}
        </div>

        {/* Headcount */}
        <div className="space-y-1">
          <Label>
            募集人数 <span className="text-destructive">必須</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              {...register("headcount", { valueAsNumber: true })}
              placeholder="人数"
              className="w-24"
            />
            <span className="text-body-md">人</span>
          </div>
          {errors.headcount && (
            <p className="text-body-sm text-destructive">
              {errors.headcount.message}
            </p>
          )}
        </div>

        {/* Prefecture */}
        <div className="space-y-1">
          <Label>
            エリア <span className="text-destructive">必須</span>
          </Label>
          <Select
            value={watch("prefecture")}
            onValueChange={(v) => setValue("prefecture", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="都道府県を選択" />
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

        {/* Address */}
        <div className="space-y-1">
          <Label>詳細住所</Label>
          <Input {...register("address")} placeholder="詳細住所を入力" />
          {errors.address && (
            <p className="text-body-sm text-destructive">
              {errors.address.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label>
            案件詳細 <span className="text-destructive">必須</span>
          </Label>
          <Textarea
            {...register("description")}
            placeholder="案件の詳細を入力"
            rows={5}
          />
          {errors.description && (
            <p className="text-body-sm text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>

        {/* Work period */}
        <div className="space-y-1">
          <Label>
            工期 <span className="text-destructive">必須</span>
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

        {/* Recruitment period */}
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
      </section>

      {/* Section: 詳細情報 (optional) */}
      <section className="space-y-4">
        <h2 className="text-heading-md font-bold text-secondary">詳細情報</h2>

        <div className="space-y-1">
          <Label>稼働時間</Label>
          <Input
            {...register("workHours")}
            placeholder="例: 8:00〜17:00"
          />
        </div>

        <div className="space-y-1">
          <Label>経験年数</Label>
          <Input
            {...register("experienceYears")}
            placeholder="例: 3年以上"
          />
        </div>

        <div className="space-y-1">
          <Label>持ち物</Label>
          <Input
            {...register("items")}
            placeholder="例: 安全靴、ヘルメット、安全帯、手工具（ハーネス含む）、墨出道具"
          />
        </div>

        <div className="space-y-1">
          <Label>スキル</Label>
          <Input
            {...register("requiredSkills")}
            placeholder="必要なスキルを入力"
          />
        </div>

        <div className="space-y-1">
          <Label>国籍・言語</Label>
          <Input
            {...register("nationalityLanguage")}
            placeholder="国籍・言語の要件を入力"
          />
        </div>

        <div className="space-y-1">
          <Label>スケジュール詳細</Label>
          <Textarea
            {...register("scheduleDetail")}
            placeholder="スケジュールの詳細を入力"
            rows={3}
          />
        </div>

        <div className="space-y-1">
          <Label>請負案件詳細</Label>
          <Textarea
            {...register("projectDetails")}
            placeholder="請負案件の詳細を入力"
            rows={3}
          />
        </div>

        <div className="space-y-1">
          <Label>発注者からのメッセージ</Label>
          <Textarea
            {...register("ownerMessage")}
            placeholder="応募者へのメッセージを入力"
            rows={3}
          />
        </div>

        <div className="space-y-1">
          <Label>勤務地詳細</Label>
          <Input
            {...register("location")}
            placeholder="勤務地の詳細を入力"
          />
        </div>

        <div className="space-y-1">
          <Label>その他</Label>
          <Textarea
            {...register("etcMessage")}
            placeholder="その他の情報を入力"
            rows={3}
          />
        </div>
      </section>

      {/* Section: Images */}
      <section className="space-y-4">
        <JobImageUploader
          existingImages={existingImages}
          newFiles={newFiles}
          onFilesChange={setNewFiles}
          onDeleteExisting={mode === "edit" ? handleDeleteExisting : undefined}
        />
      </section>

      {/* Status change buttons for edit mode */}
      {mode === "edit" && currentStatus === "draft" && (
        <div className="space-y-2">
          <Button
            type="submit"
            className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isPending}
            onClick={handlePublish}
          >
            {isPending ? "処理中..." : "入力内容を確認する"}
          </Button>
        </div>
      )}

      {/* Submit buttons */}
      <div className="space-y-3">
        {mode === "create" && (
          <>
            <Button
              type="submit"
              className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
              onClick={handlePublish}
            >
              {isPending ? "処理中..." : "入力内容を確認する"}
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="w-full rounded-[47px] border-secondary text-secondary"
              disabled={isPending}
              onClick={handleSaveAsDraft}
            >
              {isPending ? "処理中..." : "下書き保存"}
            </Button>
          </>
        )}

        {mode === "edit" && (
          <Button
            type="submit"
            className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isPending}
          >
            {isPending ? "処理中..." : "入力内容を確認する"}
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
