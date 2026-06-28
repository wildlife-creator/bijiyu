"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/send-email";
import { adminPasswordChangedEmail } from "@/lib/email/templates/admin-password-changed";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminPasswordChangeSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";
import { formatDateTime } from "@/lib/utils/format-date";

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

    // §8.6 admin PW 変更完了通知 (fire-and-forget、admin session hijack 検知)。
    //   - 失敗は console.error のみ (PW 更新は完了、Server Action 自体は success)
    //   - admin は complete_registration を経由しないため last_name + first_name が空のケースあり。
    //     その場合は「ビジ友 管理者 様」表記でフォールバック
    void (async () => {
      try {
        const adminClient = createAdminClient();
        const { data: profile } = await adminClient
          .from("users")
          .select("last_name, first_name")
          .eq("id", user.id)
          .maybeSingle();
        const recipientName =
          `${profile?.last_name ?? ""}${profile?.first_name ?? ""}`.trim() ||
          "ビジ友 管理者";
        const { subject, html } = adminPasswordChangedEmail({
          recipientName,
          changedAt: formatDateTime(new Date().toISOString()),
        });
        await sendEmail({ to: user.email!, subject, html });
      } catch (err) {
        console.error(
          "[changeAdminPasswordAction] §8.6 admin-password-changed email failed",
          err,
        );
      }
    })();

    return { success: true };
  } catch {
    return { success: false, error: "予期しないエラーが発生しました" };
  }
}
