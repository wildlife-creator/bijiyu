"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { withdrawalCompletedEmail } from "@/lib/email/templates/withdrawal-completed";
import { executeWithdrawal } from "@/lib/withdrawal/execute";
import { withdrawalSchema } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

/**
 * 本人退会（COM 系・プロフィール配下）。
 * カスケード本体は executeWithdrawal（admin 削除と共有）に委譲し、
 * 本人退会固有の責務（survey 記録・退会完了メール・signOut）のみ持つ。
 */
export async function withdrawAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証されていません。再度ログインしてください。" };
  }

  // 2. Zod validation
  const parsed = withdrawalSchema.safeParse({
    reason: formData.get("reason"),
    details: formData.get("details"),
    confirmed: formData.get("confirmed") === "on" ? true : undefined,
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "入力内容に誤りがあります。";
    return { success: false, error: firstError };
  }

  // 3. カスケード退会（ガード・survey・ソフトデリート・Stripe 解約・ban）
  const result = await executeWithdrawal({
    targetUserId: user.id,
    recordSurvey: {
      reasonCode: parsed.data.reason,
      details: parsed.data.details ?? null,
    },
    cancelledBy: "contractor",
  });

  if (!result.success) {
    return result;
  }

  // 4. 退会完了メール（REQ-PF-006 step 7）
  // 失敗時は非ロールバック（security.md「メール送信失敗時の共通方針」）
  try {
    const { data: deletedUser } = await createAdminClient()
      .from("users")
      .select("email, last_name, first_name")
      .eq("id", user.id)
      .maybeSingle();
    const email = deletedUser?.email ?? user.email;
    const recipientName =
      `${deletedUser?.last_name ?? ""}${deletedUser?.first_name ?? ""}`.trim() ||
      "ご利用者";
    if (email) {
      const { subject, html } = withdrawalCompletedEmail({
        recipientName,
      });
      await sendEmail({ to: email, subject, html });
    }
  } catch (emailError) {
    console.error(
      "[withdrawAction] withdrawal email failed (non-blocking)",
      emailError,
    );
  }

  // 5. Invalidate session
  await supabase.auth.signOut();

  return { success: true };
}
