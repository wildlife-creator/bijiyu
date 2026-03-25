"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";
import type { Json } from "@/types/database";

/**
 * Mask email for audit logs: first char + *** + @domain
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

/**
 * Write an audit log entry. Failures are silently caught so they never
 * block the login flow.
 */
async function writeAuditLog(params: {
  action: string;
  actorId?: string;
  targetId: string;
  targetType: string;
  metadata?: { [key: string]: Json | undefined };
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action: params.action,
      actor_id: params.actorId ?? null,
      target_id: params.targetId,
      target_type: params.targetType,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Audit log failure must not block auth flow
  }
}

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
      targetId: email,
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
