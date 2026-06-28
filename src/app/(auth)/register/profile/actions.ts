"use server";

import { sendEmail } from "@/lib/email/send-email";
import { registrationCompletedEmail } from "@/lib/email/templates/registration-completed";
import { createClient } from "@/lib/supabase/server";
import { registerProfileSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";
import { validateLabelChanges } from "@/lib/master/validate";
import { validateAreaChanges } from "@/lib/master/validate-area";
import { expandAreasForDb } from "@/lib/master/area-conversion";

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

  // 新規登録時は previousLabels=[] で delta validate (= added 全件が active 必須)
  const tradeValid = await validateLabelChanges(
    data.skills.map((s) => s.tradeType),
    [],
    "trade-types",
  );
  if (!tradeValid.valid) {
    return {
      success: false,
      error:
        tradeValid.unknownLabels.length > 0
          ? `存在しない職種が含まれています: ${tradeValid.unknownLabels.join("、")}`
          : `廃止された職種は登録できません: ${tradeValid.deprecatedLabels.join("、")}`,
    };
  }

  // UI 層の AreaRow[] を DB 層の AreaTuple[] に平坦化
  const flatAreas = expandAreasForDb(data.availableAreas);

  // 対応エリアのマスタ整合性検証 (新規登録のため previousAreas は空配列)
  const areaValid = await validateAreaChanges(flatAreas, []);
  if (!areaValid.valid) {
    const fmt = (a: { prefecture: string; municipality: string | null }) =>
      a.municipality ? `${a.prefecture}${a.municipality}` : a.prefecture;
    return {
      success: false,
      error:
        areaValid.unknownPairs.length > 0
          ? `存在しないエリアが含まれています: ${areaValid.unknownPairs.map(fmt).join("、")}`
          : `廃止されたエリアは登録できません: ${areaValid.deprecatedPairs.map(fmt).join("、")}`,
    };
  }

  // Convert skills to JSONB format for the RPC call
  const skillsJsonb = data.skills.map((skill) => ({
    trade_type: skill.tradeType,
    experience_years: skill.experienceYears,
  }));

  // Call the complete_registration RPC function
  // p_areas は jsonb (AreaTuple[] を JS array としてそのまま渡せば SDK が jsonb 変換)
  const { error: rpcError } = await supabase.rpc("complete_registration", {
    p_user_id: user.id,
    p_last_name: data.lastName,
    p_first_name: data.firstName,
    p_gender: data.gender,
    p_birth_date: data.birthDate,
    p_prefecture: data.prefecture,
    p_municipality: data.municipality || undefined,
    p_company_name: data.companyName ?? undefined,
    p_skills: skillsJsonb,
    p_areas: flatAreas,
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

  // §8.2 会員登録完了 welcome (non-blocking, do not fail registration).
  //   - 件名統一「【ビジ友】会員登録が完了しました」
  //   - 姓名はスペースなし結合 (CLAUDE.md「日本語の姓名結合はスペースなし」準拠)
  //   - sendEmail() ヘルパー経由 (dev は /tmp/bijiyu-dev-mail に書き出し)
  try {
    const recipientEmail = user.email;
    if (recipientEmail) {
      const recipientName =
        `${data.lastName}${data.firstName}`.trim() || "ご利用者";
      const { subject, html } = registrationCompletedEmail({ recipientName });
      await sendEmail({ to: recipientEmail, subject, html });
    }
  } catch (err) {
    // Welcome email failure should not block registration
    console.error("[completeRegistrationAction] welcome email failed", err);
  }

  return { success: true };
}
