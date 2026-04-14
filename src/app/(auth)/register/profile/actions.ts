"use server";

import { Resend } from "resend";

import { createClient } from "@/lib/supabase/server";
import { registerProfileSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

export async function completeRegistrationAction(
  input: unknown
): Promise<ActionResult> {
  const parsed = registerProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容に不備があります" };
  }

  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証情報が見つかりません。再度ログインしてください。" };
  }

  // Convert skills to JSONB format for the RPC call
  const skillsJsonb = data.skills.map((skill) => ({
    trade_type: skill.tradeType,
    experience_years: skill.experienceYears,
  }));

  // Call the complete_registration RPC function
  const { error: rpcError } = await supabase.rpc("complete_registration", {
    p_user_id: user.id,
    p_last_name: data.lastName,
    p_first_name: data.firstName,
    p_gender: data.gender,
    p_birth_date: data.birthDate,
    p_prefecture: data.prefecture,
    p_company_name: data.companyName ?? undefined,
    p_skills: skillsJsonb,
    p_areas: data.availableAreas,
  });

  if (rpcError) {
    return { success: false, error: "プロフィールの保存に失敗しました。もう一度お試しください。" };
  }

  // Update password via Supabase Auth
  const { error: passwordError } = await supabase.auth.updateUser({
    password: data.password,
  });

  if (passwordError) {
    return { success: false, error: "パスワードの設定に失敗しました。もう一度お試しください。" };
  }

  // Send welcome email (non-blocking, do not fail registration)
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "ビジ友 <noreply@bijiyu.com>",
        to: user.email ?? "",
        subject: "ビジ友へようこそ！",
        text: `${data.lastName} ${data.firstName} 様\n\nビジ友への会員登録が完了しました。\nぜひサービスをご活用ください。\n\nビジ友運営チーム`,
      });
    }
  } catch {
    // Welcome email failure should not block registration
  }

  return { success: true };
}
