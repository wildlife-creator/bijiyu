"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";
import { VideoUrlSchema } from "@/lib/validations/video";

/**
 * 管理者による動画 URL 代理更新（video-display Task 5.4）。
 *
 * - 認可: middleware の /admin/* admin ガード + ここでの role 再チェック（三重防御の 2 層目）。
 *   UPDATE は admin（service-role）client で実行する。
 * - 検証: VideoUrlSchema で parseVideoUrl 通過 or 空文字を判定。
 *   空文字 → 対応カラムを NULL に更新（掲載停止）。
 */

interface VideoUpdateConfig {
  table: "users" | "client_profiles";
  column: "video_url" | "workplace_video_url";
  matchColumn: "id" | "user_id";
}

async function updateVideoColumn(
  formData: FormData,
  config: VideoUpdateConfig,
): Promise<ActionResult> {
  const userId = String(formData.get("userId") ?? "");
  const rawUrl = String(formData.get("url") ?? "");

  if (!userId) {
    return { success: false, error: "対象ユーザーが指定されていません" };
  }

  // 認可: admin role 再チェック
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインしてください" };
  }
  const { data: actor } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (actor?.role !== "admin") {
    return { success: false, error: "この操作を行う権限がありません" };
  }

  // 検証（空文字許容 = 掲載停止）
  const parsed = VideoUrlSchema.safeParse(rawUrl);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "対応プラットフォームの URL を入力してください",
    };
  }
  const value = parsed.data === "" ? null : parsed.data;

  // admin（service-role）client で UPDATE（RLS バイパス）
  const admin = createAdminClient();
  const { error } = await admin
    .from(config.table)
    .update({ [config.column]: value })
    .eq(config.matchColumn, userId);

  if (error) {
    console.error("[admin updateVideoColumn] update failed", error);
    return {
      success: false,
      error: "更新に失敗しました。しばらくしてから再度お試しください",
    };
  }

  // 監査ログ（管理者の全操作を記録する要件。失敗しても本体処理は止めない）
  await writeAuditLog({
    actorId: user.id,
    action: "video_url_update",
    targetType: config.table,
    targetId: userId,
    metadata: { column: config.column, cleared: value === null },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}

/**
 * 管理者ログアウト（AdminShell のヘッダーから呼ばれる）。
 * 一般ユーザー用 logoutAction（/login へ redirect）は流用せず、
 * admin 専用に /admin/login へ戻す。
 */
export async function adminLogoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/** ADM-010: 受注者PR動画（users.video_url）を更新する。 */
export async function updateVideoUrlAction(
  formData: FormData,
): Promise<ActionResult> {
  return updateVideoColumn(formData, {
    table: "users",
    column: "video_url",
    matchColumn: "id",
  });
}

/** ADM-010B: 職場紹介動画（client_profiles.workplace_video_url）を更新する。 */
export async function updateWorkplaceVideoUrlAction(
  formData: FormData,
): Promise<ActionResult> {
  return updateVideoColumn(formData, {
    table: "client_profiles",
    column: "workplace_video_url",
    matchColumn: "user_id",
  });
}
