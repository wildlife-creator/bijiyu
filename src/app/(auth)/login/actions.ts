"use server";

import { redirect } from "next/navigation";

import { maskEmail, writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

/** audit_logs.target_id は uuid 型のため、対象ユーザー不明（ログイン失敗）時に使う */
const UNKNOWN_TARGET_ID = "00000000-0000-0000-0000-000000000000";

export async function loginAction(
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
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
      metadata: { email: maskEmail(email) },
    });
    return {
      success: false,
      error: "メールアドレスまたはパスワードが正しくありません",
    };
  }

  // Determine redirect based on user role
  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  const role = userRow?.role;
  const redirectTo = role === "admin" ? "/admin/dashboard" : "/mypage";

  await writeAuditLog({
    action: "auth.login.success",
    actorId: authData.user.id,
    targetId: authData.user.id,
    targetType: "auth",
    metadata: { email: maskEmail(email) },
  });

  redirect(redirectTo);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
