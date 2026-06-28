"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { adminClientInviteCompletedEmail } from "@/lib/email/templates/admin-client-invite-completed";
import { formatDateTime } from "@/lib/utils/format-date";
import { updatePasswordSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * AUTH-008: 招待承諾画面のパスワード初回設定 Server Action
 *
 * - 招待リンク（type=invite）でセッション確立済みの前提
 * - supabase.auth.updateUser でパスワードを設定
 * - admin client で public.users.password_set_at = now() をセット
 * - 期限切れ / 無効トークンは日本語エラー
 * - Client 招待 (`invited_company_name` あり) 経由なら §5.3.B 完了通知を
 *   操作した admin 本人に fire-and-forget で送信
 */
export async function acceptInviteAction(
  input: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error:
        "リンクの有効期限が切れています。招待元に再送を依頼してください",
    };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (passwordError) {
    if (
      passwordError.message.includes("expired") ||
      passwordError.message.includes("invalid")
    ) {
      return {
        success: false,
        error:
          "リンクの有効期限が切れています。招待元に再送を依頼してください",
      };
    }
    return {
      success: false,
      error:
        "パスワードの設定に失敗しました。時間をおいて再度お試しください",
    };
  }

  const admin = createAdminClient();

  // 既セット判定 (§5.3.B 重複発火防止)。
  // password_set_at が既に入っているなら 2 回目以降の acceptInviteAction
  // (リロード等) なので完了通知は飛ばさない。
  const { data: priorRow } = await admin
    .from("users")
    .select("password_set_at")
    .eq("id", user.id)
    .maybeSingle();
  const wasAlreadyAccepted = !!priorRow?.password_set_at;

  // password_set_at を記録（招待完了マーカー。CLI-022 の「招待中」バッジ判定用）
  const { error: updateError } = await admin
    .from("users")
    .update({ password_set_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    // password は更新済みなので、クライアントには成功として返す。
    // password_set_at の未記録は CLI-022 の表示影響のみでセキュリティには
    // 影響しない。サーバーログには記録する。
    console.error("[acceptInviteAction] password_set_at update failed", updateError);
  }

  // 管理者による発注者招待（ADM-006/007）: invited_company_name が
  // metadata にある場合は受注者オンボをスキップし、プラン案内（CLI-026 = /billing）へ
  // 直行する。/billing には「申し込む」ボタン（Stripe Checkout）があり、ここから発注者化できる。
  // （/billing/plans は申し込みボタンの無いプラン比較表なので遷移先にしない）
  // スタッフ招待・通常招待は従来どおり /mypage
  const invitedCompanyName = user.user_metadata?.invited_company_name;
  const isClientInvite =
    typeof invitedCompanyName === "string" && invitedCompanyName.trim() !== "";
  const redirectTo = isClientInvite ? "/billing" : "/mypage";

  // §5.3.B Client 招待完了通知 (Resend、ビジ友運営 admin 本人宛)。
  //   - 重複発火防止: password_set_at が既セットなら skip
  //   - actor 解決: audit_logs.action='admin_client_invite' AND target_id=user.id を逆引き
  //   - 解決失敗 / sendEmail 失敗ともサイレントに継続 (Server Action は成功扱い)
  if (isClientInvite && !wasAlreadyAccepted) {
    try {
      const { data: auditRow } = await admin
        .from("audit_logs")
        .select("actor_id")
        .eq("action", "admin_client_invite")
        .eq("target_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (auditRow?.actor_id) {
        const { data: adminRow } = await admin
          .from("users")
          .select("email, last_name, first_name")
          .eq("id", auditRow.actor_id)
          .maybeSingle();

        if (adminRow?.email) {
          const recipientName =
            `${adminRow.last_name ?? ""}${adminRow.first_name ?? ""}`.trim() ||
            "ご担当者";
          const invitedLastName =
            typeof user.user_metadata?.invited_last_name === "string"
              ? user.user_metadata.invited_last_name
              : "";
          const invitedFirstName =
            typeof user.user_metadata?.invited_first_name === "string"
              ? user.user_metadata.invited_first_name
              : "";
          const memberName = `${invitedLastName}${invitedFirstName}` || "ご担当者";
          const memberEmail = user.email ?? "";

          const { subject, html } = adminClientInviteCompletedEmail({
            recipientName,
            memberName,
            companyName: invitedCompanyName as string,
            memberEmail,
            acceptedAt: formatDateTime(new Date().toISOString()),
          });
          await sendEmail({ to: adminRow.email, subject, html });
        } else {
          console.error(
            "[acceptInviteAction] §5.3.B skip: admin row / email not found",
            { actor_id: auditRow.actor_id },
          );
        }
      } else {
        console.error(
          "[acceptInviteAction] §5.3.B skip: audit_logs lookup empty",
          { target_id: user.id },
        );
      }
    } catch (err) {
      console.error(
        "[acceptInviteAction] §5.3.B admin-client-invite-completed mail failed",
        err,
      );
    }
  }

  return { success: true, data: { redirectTo } };
}
