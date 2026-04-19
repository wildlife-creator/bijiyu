"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePasswordSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * AUTH-008: 招待承諾画面のパスワード初回設定 Server Action
 *
 * - 招待リンク（type=invite）でセッション確立済みの前提
 * - supabase.auth.updateUser でパスワードを設定
 * - admin client で public.users.password_set_at = now() をセット
 * - 期限切れ / 無効トークンは日本語エラー
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

  // password_set_at を記録（招待完了マーカー。CLI-022 の「招待中」バッジ判定用）
  const admin = createAdminClient();
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

  return { success: true, data: { redirectTo: "/mypage" } };
}
