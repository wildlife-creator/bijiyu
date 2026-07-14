"use server";

import { sendEmail } from "@/lib/email/send-email";
import { registrationCompletedEmail } from "@/lib/email/templates/registration-completed";
import { createClient } from "@/lib/supabase/server";
import { registerProfileSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";
import {
  validateLabelChanges,
  labelValidationErrorMessage,
} from "@/lib/master/validate";
import {
  validateAreaChanges,
  areaValidationErrorMessage,
} from "@/lib/master/validate-area";
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

  // パスワードは最初に設定する。この後のマスタ照合や RPC が一時的に失敗しても、
  // ユーザーが選んだパスワードでログインでき、middleware が last_name=NULL を
  // 見て /register/profile に戻すため自力でやり直せる。設定を最後に置くと、
  // 途中失敗時に「メール確認済み・パスワード未設定」の復旧不能アカウントが残る。
  const { error: passwordError } = await supabase.auth.updateUser({
    password: data.password,
  });

  // GoTrue は「新しいパスワードが現在のパスワードと同一」の場合に
  // same_password (HTTP 422) で拒否する。これは次の復旧シナリオで起こる:
  //   1. サインアップ→メール確認したが profile 未入力でページを閉じる
  //      (auth ユーザーは一時パスワードのまま last_name=NULL で残る)
  //   2. ログイン画面の「パスワードをお忘れの方」で本人がパスワード X を設定
  //   3. ログイン→middleware が last_name=NULL を見て /register/profile に差し戻し
  //   4. この画面で手順 2 と同じパスワード X を入力して「登録する」
  // このとき「既に望みのパスワードが設定済み」なので、same_password は
  // 実質的な成功として扱い、登録処理を続行する(エラーにすると詰む)。
  if (passwordError && !isSamePasswordError(passwordError)) {
    return { success: false, error: "パスワードの設定に失敗しました。もう一度お試しください。" };
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
      error: labelValidationErrorMessage(tradeValid, "職種"),
    };
  }

  // UI 層の AreaRow[] を DB 層の AreaTuple[] に平坦化
  const flatAreas = expandAreasForDb(data.availableAreas);

  // 対応エリアのマスタ整合性検証 (新規登録のため previousAreas は空配列)
  const areaValid = await validateAreaChanges(flatAreas, []);
  if (!areaValid.valid) {
    return {
      success: false,
      error: areaValidationErrorMessage(areaValid),
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

/**
 * GoTrue の「新しいパスワードが現在のパスワードと同一」エラーかを判定する。
 * updateUser は同一パスワードを HTTP 422 / code "same_password" で拒否する。
 * supabase-js のバージョン差で code が乗らないケースに備え、メッセージ照合も併用する。
 */
function isSamePasswordError(error: {
  code?: string | null;
  message?: string;
}): boolean {
  if (error.code === "same_password") return true;
  return /different from the old password/i.test(error.message ?? "");
}
