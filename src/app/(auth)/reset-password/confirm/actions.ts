"use server";

import { createClient } from "@/lib/supabase/server";
import { updatePasswordSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

export async function updatePasswordAction(
  formData: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = updatePasswordSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (error.message.includes("expired") || error.message.includes("invalid")) {
      return {
        success: false,
        error: "リンクの有効期限が切れています。再度パスワード再設定を申請してください。",
      };
    }
    return {
      success: false,
      error: "パスワードの更新に失敗しました。もう一度お試しください。",
    };
  }

  return { success: true, data: { redirectTo: "/login" } };
}
