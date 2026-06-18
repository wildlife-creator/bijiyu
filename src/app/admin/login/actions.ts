"use server";

import { redirect } from "next/navigation";

import { maskEmail, writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

/** audit_logs.target_id は uuid 型のため、対象ユーザー不明（ログイン失敗）時に使う */
const UNKNOWN_TARGET_ID = "00000000-0000-0000-0000-000000000000";

/**
 * エラー文言はこの1種類のみ（アカウントの存在・権限の推測を防止する。
 * 非 admin が正しい資格情報でログインした場合も同一文言を返す）
 */
const GENERIC_ERROR = "メールアドレスまたはパスワードが正しくありません";

/** ADM-001: 管理者専用ログイン。成功時は /admin/dashboard へ redirect する */
export async function adminLoginAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.user) {
    await writeAuditLog({
      action: "auth.login.failure",
      actorId: null,
      targetId: UNKNOWN_TARGET_ID,
      targetType: "auth",
      metadata: { email: maskEmail(email), context: "admin_login" },
    });
    return { success: false, error: GENERIC_ERROR };
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (userRow?.role !== "admin") {
    // 非 admin はセッションを残さず、資格情報エラーと同一文言で拒否する
    await supabase.auth.signOut();
    await writeAuditLog({
      action: "auth.login.failure",
      actorId: null,
      targetId: authData.user.id,
      targetType: "auth",
      metadata: {
        email: maskEmail(email),
        context: "admin_login",
        reason: "not_admin",
      },
    });
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    action: "auth.login.success",
    actorId: authData.user.id,
    targetId: authData.user.id,
    targetType: "auth",
    metadata: { email: maskEmail(email), context: "admin_login" },
  });

  redirect("/admin/dashboard");
}
