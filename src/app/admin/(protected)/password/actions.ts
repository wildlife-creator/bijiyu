"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { adminPasswordChangeSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-015: 管理者パスワード変更。
 * 現在のパスワードを signInWithPassword で照合してから updateUser で更新する。
 * 成功時は遷移せずインラインメッセージ表示（呼び出し側で表示）。
 */
export async function changeAdminPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    // 認可: admin role 再チェック（Middleware + layout に加えた三重防御）
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
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

    const parsed = adminPasswordChangeSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.issues[0]?.message ?? "入力内容を確認してください",
      };
    }

    // 現在のパスワード照合（失敗しても既存セッションは維持される）
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    });
    if (verifyError) {
      return { success: false, error: "現在のパスワードが正しくありません" };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.newPassword,
    });
    if (updateError) {
      return {
        success: false,
        error: "パスワードの変更に失敗しました。時間をおいて再度お試しください",
      };
    }

    await writeAuditLog({
      actorId: user.id,
      action: "admin_password_change",
      targetType: "users",
      targetId: user.id,
    });

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}
