"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { passwordResetCompletedEmail } from "@/lib/email/templates/password-reset-completed";
import { formatDateTime } from "@/lib/utils/format-date";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // §5.8.A パスワードリセット完了通知（hijack 検知用）。
  // 非ブロッキング: メール送信に失敗してもリダイレクトは進める。
  if (user) {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("users")
        .select("email, last_name, first_name")
        .eq("id", user.id)
        .maybeSingle();
      const email = profile?.email ?? user.email;
      const recipientName =
        `${profile?.last_name ?? ""}${profile?.first_name ?? ""}`.trim() ||
        "ご利用者";
      if (email) {
        const { subject, html } = passwordResetCompletedEmail({
          recipientName,
          changedAt: formatDateTime(new Date().toISOString()),
        });
        await sendEmail({ to: email, subject, html });
      }
    } catch (emailError) {
      console.error(
        "[updatePasswordAction] password reset completed email failed (non-blocking)",
        emailError,
      );
    }
  }

  return { success: true, data: { redirectTo: "/login" } };
}
