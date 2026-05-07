"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createScheduleAction,
  updateScheduleAction,
} from "@/app/(authenticated)/schedule/actions";
import { scheduleSchema, type ScheduleInput } from "@/lib/validations/schedule";

type ScheduleEditValues = {
  id: string;
  startDate: string;
  endDate: string;
};

export type ScheduleFormProps =
  | { mode: "create"; submitLabel: string }
  | {
      mode: "edit";
      defaultValues: ScheduleEditValues;
      submitLabel: string;
    };

function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ScheduleForm(props: ScheduleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const todayIso = todayLocalIso();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ScheduleInput>({
    resolver: zodResolver(scheduleSchema),
    defaultValues:
      props.mode === "edit"
        ? {
            startDate: props.defaultValues.startDate,
            endDate: props.defaultValues.endDate,
          }
        : { startDate: "", endDate: "" },
  });

  const startDate = watch("startDate");
  const endMin = startDate && startDate >= todayIso ? startDate : todayIso;

  function onSubmit(values: ScheduleInput) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("startDate", values.startDate);
      formData.set("endDate", values.endDate);

      const result =
        props.mode === "edit"
          ? await updateScheduleAction(props.defaultValues.id, formData)
          : await createScheduleAction(formData);

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.warning) {
        toast.warning(result.data.warning);
      }
      router.push("/schedule");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="startDate" className="text-body-sm font-medium">
          開始日
          <span className="ml-2 text-body-xs font-bold text-destructive">
            必須
          </span>
        </Label>
        <Input
          id="startDate"
          type="date"
          min={todayIso}
          className="bg-background"
          {...register("startDate")}
        />
        {errors.startDate?.message && (
          <p className="text-body-sm text-destructive">
            {errors.startDate.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="endDate" className="text-body-sm font-medium">
          終了日
          <span className="ml-2 text-body-xs font-bold text-destructive">
            必須
          </span>
        </Label>
        <Input
          id="endDate"
          type="date"
          min={endMin}
          className="bg-background"
          {...register("endDate")}
        />
        {errors.endDate?.message && (
          <p className="text-body-sm text-destructive">
            {errors.endDate.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="w-full rounded-pill bg-primary text-white hover:bg-primary/90"
      >
        {isPending ? "送信中..." : props.submitLabel}
      </Button>
    </form>
  );
}
