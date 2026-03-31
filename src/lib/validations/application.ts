import { z } from "zod";

export const applicationSchema = z.object({
  jobId: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "案件IDが不正です",
    ),
  headcount: z.coerce
    .number()
    .int("整数を入力してください")
    .min(1, "1名以上を入力してください"),
  workingType: z.string().min(1, "日程/働き方を入力してください"),
  preferredFirstWorkDate: z
    .string()
    .min(1, "初回稼働希望日を選択してください"),
  message: z.string().optional(),
});
