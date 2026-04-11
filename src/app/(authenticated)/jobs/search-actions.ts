"use server";

import { createClient } from "@/lib/supabase/server";
import { applicationSchema } from "@/lib/validations/application";
import { canApplyJob } from "@/lib/utils/can-apply-job";
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// applyJobAction
// ---------------------------------------------------------------------------

export async function applyJobAction(
  formData: FormData,
): Promise<ActionResult<{ applicationId: string }>> {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      };
    }

    // 2. Role check
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      !userData ||
      !["contractor", "client"].includes(userData.role)
    ) {
      return { success: false, error: "応募する権限がありません。" };
    }

    // 3. Zod validation
    const raw = {
      jobId: formData.get("jobId"),
      headcount: formData.get("headcount"),
      workingType: formData.get("workingType"),
      preferredFirstWorkDate: formData.get("preferredFirstWorkDate"),
      message: formData.get("message") || undefined,
      scoutMessageId: formData.get("scoutMessageId") || undefined,
    };

    const parsed = applicationSchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message;
      return {
        success: false,
        error: firstError ?? "入力内容に不備があります",
      };
    }

    const data = parsed.data;

    // 4. Job status check
    const { data: job } = await supabase
      .from("jobs")
      .select("id, status, trade_type, prefecture")
      .eq("id", data.jobId)
      .is("deleted_at", null)
      .single();

    if (!job || job.status !== "open") {
      return {
        success: false,
        error: "この案件は現在募集を受け付けていません。",
      };
    }

    // 5. Duplicate application check
    const { data: existing } = await supabase
      .from("applications")
      .select("id, status")
      .eq("job_id", data.jobId)
      .eq("applicant_id", user.id)
      .neq("status", "cancelled")
      .maybeSingle();

    if (existing) {
      return { success: false, error: "この案件には既に応募済みです。" };
    }

    // 6. Application restriction check (free users only)
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    const isPaidUser =
      !!subscription || userData.role === "client";

    if (!isPaidUser) {
      const { data: skills } = await supabase
        .from("user_skills")
        .select("trade_type")
        .eq("user_id", user.id);

      const { data: areas } = await supabase
        .from("user_available_areas")
        .select("prefecture")
        .eq("user_id", user.id);

      const check = canApplyJob({
        userRole: userData.role as "contractor" | "client" | "staff",
        isPaidUser: false,
        jobTradeType: job.trade_type ?? "",
        jobPrefecture: job.prefecture ?? "",
        userSkills: (skills ?? []).map((s) => ({ tradeType: s.trade_type })),
        userAvailableAreas: (areas ?? []).map((a) => ({
          prefecture: a.prefecture,
        })),
      });

      if (!check.canApply) {
        return {
          success: false,
          error:
            check.reason ??
            "応募条件を満たしていません。プロフィールの職種・エリアを更新してください。",
        };
      }
    }

    // 7. Validate scout_message_id if provided
    let validatedScoutMessageId: string | null = null;
    if (data.scoutMessageId) {
      const { data: scoutMsg } = await supabase
        .from("messages")
        .select("id, is_scout")
        .eq("id", data.scoutMessageId)
        .single();

      if (!scoutMsg || !scoutMsg.is_scout) {
        return {
          success: false,
          error: "スカウトメッセージが見つかりません。",
        };
      }
      validatedScoutMessageId = scoutMsg.id;
    }

    // 8. INSERT
    const { data: application, error: insertError } = await supabase
      .from("applications")
      .insert({
        job_id: data.jobId,
        applicant_id: user.id,
        headcount: data.headcount,
        working_type: data.workingType,
        preferred_first_work_date: data.preferredFirstWorkDate,
        message: data.message || null,
        status: "applied",
        scout_message_id: validatedScoutMessageId,
      })
      .select("id")
      .single();

    if (insertError || !application) {
      return {
        success: false,
        error: "応募の登録に失敗しました。時間をおいて再度お試しください。",
      };
    }

    return { success: true, data: { applicationId: application.id } };
  } catch {
    return {
      success: false,
      error: "応募の登録に失敗しました。時間をおいて再度お試しください。",
    };
  }
}

// ---------------------------------------------------------------------------
// toggleFavoriteAction
// ---------------------------------------------------------------------------

export async function toggleFavoriteAction(
  formData: FormData,
): Promise<ActionResult<{ isFavorited: boolean }>> {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      };
    }

    const targetType = formData.get("targetType") as string;
    const targetId = formData.get("targetId") as string;

    if (!targetType || !targetId) {
      return { success: false, error: "不正なリクエストです。" };
    }

    // 2. Role + target_type validation
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return { success: false, error: "ユーザー情報が見つかりません。" };
    }

    const allowedTypes: Record<string, string[]> = {
      contractor: ["job", "client"],
      client: ["job", "client", "user"],
      staff: ["job", "client", "user"],
    };

    const allowed = allowedTypes[userData.role];
    if (!allowed || !allowed.includes(targetType)) {
      return { success: false, error: "不正なリクエストです。" };
    }

    // 3. Target existence check
    let targetExists = false;
    if (targetType === "job") {
      const { data } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", targetId)
        .is("deleted_at", null)
        .maybeSingle();
      targetExists = !!data;
    } else if (targetType === "client" || targetType === "user") {
      const { data } = await supabase
        .from("users")
        .select("id")
        .eq("id", targetId)
        .is("deleted_at", null)
        .maybeSingle();
      targetExists = !!data;
    }

    if (!targetExists) {
      return { success: false, error: "対象が見つかりません。" };
    }

    // 4. Toggle: SELECT → INSERT or DELETE
    const { data: existing } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("id", existing.id);

      if (error) {
        return {
          success: false,
          error: "お気に入りの更新に失敗しました。",
        };
      }
      return { success: true, data: { isFavorited: false } };
    }

    const { error } = await supabase.from("favorites").insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
    });

    if (error) {
      return {
        success: false,
        error: "お気に入りの更新に失敗しました。",
      };
    }
    return { success: true, data: { isFavorited: true } };
  } catch {
    return {
      success: false,
      error: "お気に入りの更新に失敗しました。",
    };
  }
}
