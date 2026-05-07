"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";
import { hasOverlappingSchedule } from "@/lib/utils/has-overlapping-schedule";
import { isContractorOrClientRole } from "@/lib/utils/role-guards";
import { scheduleSchema } from "@/lib/validations/schedule";

export type ScheduleSuccessData = { warning?: string };

const OVERLAP_WARNING = "同じ期間が登録されています";
const ROLE_DENIED_ERROR = "この操作は実行できません";
const AUTH_REQUIRED_ERROR = "ログインが必要です";
const UNEXPECTED_ERROR = "予期しないエラーが発生しました";
const SAVE_FAILED_ERROR = "保存に失敗しました。時間をおいて再度お試しください";
const NOT_FOUND_OR_FORBIDDEN_ERROR = "この空き日程は編集できません";

function pickDateString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createScheduleAction(
  formData: FormData,
): Promise<ActionResult<ScheduleSuccessData>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: AUTH_REQUIRED_ERROR };
    }

    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!isContractorOrClientRole(userData?.role)) {
      return { success: false, error: ROLE_DENIED_ERROR };
    }

    const parsed = scheduleSchema.safeParse({
      startDate: pickDateString(formData, "startDate"),
      endDate: pickDateString(formData, "endDate"),
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "入力内容に誤りがあります";
      return { success: false, error: message };
    }

    const { data: existing } = await supabase
      .from("available_schedules")
      .select("id, start_date, end_date")
      .eq("user_id", user.id);

    const overlap = hasOverlappingSchedule(existing ?? [], {
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
    });

    const { error: insertError } = await supabase
      .from("available_schedules")
      .insert({
        user_id: user.id,
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate,
      });
    if (insertError) {
      return { success: false, error: SAVE_FAILED_ERROR };
    }

    revalidatePath("/schedule");
    return overlap
      ? { success: true, data: { warning: OVERLAP_WARNING } }
      : { success: true };
  } catch {
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function updateScheduleAction(
  id: string,
  formData: FormData,
): Promise<ActionResult<ScheduleSuccessData>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: AUTH_REQUIRED_ERROR };
    }

    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!isContractorOrClientRole(userData?.role)) {
      return { success: false, error: ROLE_DENIED_ERROR };
    }

    const { data: target } = await supabase
      .from("available_schedules")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (!target || target.user_id !== user.id) {
      return { success: false, error: NOT_FOUND_OR_FORBIDDEN_ERROR };
    }

    const parsed = scheduleSchema.safeParse({
      startDate: pickDateString(formData, "startDate"),
      endDate: pickDateString(formData, "endDate"),
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "入力内容に誤りがあります";
      return { success: false, error: message };
    }

    const { data: existing } = await supabase
      .from("available_schedules")
      .select("id, start_date, end_date")
      .eq("user_id", user.id);

    const overlap = hasOverlappingSchedule(
      existing ?? [],
      {
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate,
      },
      { excludeId: id },
    );

    const { error: updateError } = await supabase
      .from("available_schedules")
      .update({
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate,
      })
      .eq("id", id);
    if (updateError) {
      return { success: false, error: SAVE_FAILED_ERROR };
    }

    revalidatePath("/schedule");
    return overlap
      ? { success: true, data: { warning: OVERLAP_WARNING } }
      : { success: true };
  } catch {
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function deleteScheduleAction(
  id: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: AUTH_REQUIRED_ERROR };
    }

    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!isContractorOrClientRole(userData?.role)) {
      return { success: false, error: ROLE_DENIED_ERROR };
    }

    const { data: target } = await supabase
      .from("available_schedules")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (!target || target.user_id !== user.id) {
      return { success: false, error: NOT_FOUND_OR_FORBIDDEN_ERROR };
    }

    const { error: deleteError } = await supabase
      .from("available_schedules")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return { success: false, error: SAVE_FAILED_ERROR };
    }

    revalidatePath("/schedule");
    return { success: true };
  } catch {
    return { success: false, error: UNEXPECTED_ERROR };
  }
}
