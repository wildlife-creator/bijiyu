import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function startOfTodayLocalIso(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const scheduleSchema = z
  .object({
    startDate: z
      .string()
      .regex(ISO_DATE_REGEX, "開始日を入力してください"),
    endDate: z
      .string()
      .regex(ISO_DATE_REGEX, "終了日を入力してください"),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "終了日は開始日以降の日付を選択してください",
    path: ["endDate"],
  })
  .refine((v) => v.startDate >= startOfTodayLocalIso(), {
    message: "開始日は今日以降の日付を選択してください",
    path: ["startDate"],
  });

export type ScheduleInput = z.infer<typeof scheduleSchema>;
