"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import {
  profileEditSchema,
  AVATAR_PATH_EXTENSIONS,
} from "@/lib/validations/profile";
import { isOwnedStoragePath } from "@/lib/storage/storage-path";
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

export async function updateProfileAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "認証情報が見つかりません。再度ログインしてください。",
      };
    }

    const raw = {
      lastName: formData.get("lastName"),
      firstName: formData.get("firstName"),
      gender: formData.get("gender"),
      birthDate: formData.get("birthDate"),
      email: formData.get("email"),
      prefecture: formData.get("prefecture"),
      municipality: formData.get("municipality"),
      companyName: formData.get("companyName"),
      bio: formData.get("bio"),
      skills: JSON.parse((formData.get("skills") as string) ?? "[]"),
      skillTags: JSON.parse((formData.get("skillTags") as string) ?? "[]"),
      qualifications: JSON.parse(
        (formData.get("qualifications") as string) ?? "[]"
      ),
      availableAreas: JSON.parse(
        (formData.get("availableAreas") as string) ?? "[]"
      ),
    };

    const parsed = profileEditSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: "入力内容に不備があります" };
    }

    const data = parsed.data;

    // ──────────────────────────────────────────────────────────
    // 3 マスタの delta validate (added のみ active 必須、既存保有 deprecated 保持)
    // ──────────────────────────────────────────────────────────
    const [prevSkills, prevQuals, prevUser, prevAreas] = await Promise.all([
      supabase
        .from("user_skills")
        .select("trade_type")
        .eq("user_id", user.id),
      supabase
        .from("user_qualifications")
        .select("qualification_name")
        .eq("user_id", user.id),
      supabase
        .from("users")
        .select("skill_tags")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_available_areas")
        .select("prefecture, municipality")
        .eq("user_id", user.id),
    ]);

    const prevTradeTypes = (prevSkills.data ?? []).map((r) => r.trade_type);
    const prevQualifications = (prevQuals.data ?? []).map(
      (r) => r.qualification_name,
    );
    const prevSkillTags = (prevUser.data?.skill_tags ?? []) as string[];
    const previousAreas = (prevAreas.data ?? []).map((r) => ({
      prefecture: r.prefecture,
      municipality: r.municipality,
    }));

    const newTradeTypes = data.skills.map((s) => s.tradeType);
    const newQualifications = data.qualifications ?? [];
    const newSkillTags = data.skillTags ?? [];

    // UI 層の AreaRow[] を DB 層の AreaTuple[] に平坦化
    const flatAreas = expandAreasForDb(data.availableAreas);

    const [tradeValid, qualValid, tagValid, areaValid] = await Promise.all([
      validateLabelChanges(newTradeTypes, prevTradeTypes, "trade-types"),
      validateLabelChanges(
        newQualifications,
        prevQualifications,
        "qualifications",
      ),
      validateLabelChanges(newSkillTags, prevSkillTags, "skill-tags"),
      validateAreaChanges(flatAreas, previousAreas),
    ]);

    if (!tradeValid.valid) {
      return {
        success: false,
        error: labelValidationErrorMessage(tradeValid, "職種", "新規追加"),
      };
    }
    if (!qualValid.valid) {
      return {
        success: false,
        error: labelValidationErrorMessage(qualValid, "資格", "新規追加"),
      };
    }
    if (!tagValid.valid) {
      return {
        success: false,
        error: labelValidationErrorMessage(tagValid, "スキル", "新規追加"),
      };
    }
    if (!areaValid.valid) {
      return {
        success: false,
        error: areaValidationErrorMessage(areaValid, "新規追加"),
      };
    }

    // Convert skills to JSONB format for the RPC call
    const skillsJsonb = data.skills.map((skill) => ({
      trade_type: skill.tradeType,
      experience_years: skill.experienceYears,
    }));

    // Use individual table updates instead of RPC to avoid type casting issues
    // Update users table
    const { error: userError } = await supabase
      .from("users")
      .update({
        last_name: data.lastName,
        first_name: data.firstName,
        gender: data.gender,
        birth_date: data.birthDate,
        prefecture: data.prefecture,
        municipality: data.municipality || null,
        company_name: data.companyName ?? null,
        bio: data.bio ?? null,
        skill_tags: data.skillTags ?? [],
      })
      .eq("id", user.id);

    if (userError) {
      return {
        success: false,
        error: "プロフィールの保存に失敗しました。もう一度お試しください。",
      };
    }

    // Replace skills: delete all then insert new
    await supabase.from("user_skills").delete().eq("user_id", user.id);
    if (skillsJsonb.length > 0) {
      const { error: skillsError } = await supabase
        .from("user_skills")
        .insert(
          skillsJsonb.map((s) => ({
            user_id: user.id,
            trade_type: s.trade_type,
            experience_years: s.experience_years,
          }))
        );
      if (skillsError) {
        return {
          success: false,
          error: "職種の保存に失敗しました。もう一度お試しください。",
        };
      }
    }

    // Replace qualifications
    await supabase
      .from("user_qualifications")
      .delete()
      .eq("user_id", user.id);
    const quals = data.qualifications ?? [];
    if (quals.length > 0) {
      const { error: qualsError } = await supabase
        .from("user_qualifications")
        .insert(
          quals.map((q) => ({
            user_id: user.id,
            qualification_name: q,
          }))
        );
      if (qualsError) {
        return {
          success: false,
          error: "資格の保存に失敗しました。もう一度お試しください。",
        };
      }
    }

    // Replace available areas via RPC (DELETE old + INSERT new in 1 トランザクション)
    const { error: areasError } = await supabase.rpc("replace_user_areas", {
      p_user_id: user.id,
      p_areas: flatAreas,
    });
    if (areasError) {
      return {
        success: false,
        error: "対応エリアの保存に失敗しました。もう一度お試しください。",
      };
    }

    // Update email if provided and different from current
    if (data.email && data.email !== user.email) {
      // §5.5.D ランディング画面へ遷移させるため emailRedirectTo を渡す。
      // host header から組むことで localhost / 127.0.0.1 の cookie ドメインずれを回避
      // (CLAUDE.md「Server Action から emailRedirectTo を組む時は host header を使う」)。
      const hdrs = await headers();
      const host = hdrs.get("host");
      const proto = hdrs.get("x-forwarded-proto") ?? "http";
      const siteUrl = host
        ? `${proto}://${host}`
        : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");
      const { error: emailError } = await supabase.auth.updateUser(
        { email: data.email },
        { emailRedirectTo: `${siteUrl}/email-change-confirmed` },
      );

      if (emailError) {
        return {
          success: false,
          error:
            "メールアドレスの更新に失敗しました。もう一度お試しください。",
        };
      }
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "プロフィールの保存に失敗しました。もう一度お試しください。",
    };
  }
}

export async function uploadAvatarAction(
  formData: FormData
): Promise<ActionResult<{ avatarUrl: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "認証情報が見つかりません。再度ログインしてください。",
    };
  }

  // 画像はブラウザから direct-upload 済み (Vercel の 4.5MB 上限回避)。
  // 本人フォルダ配下のパスのみ許可
  const rawPath = formData.get("avatarPath");
  const path = typeof rawPath === "string" ? rawPath : "";
  if (!path || !isOwnedStoragePath(path, user.id, AVATAR_PATH_EXTENSIONS)) {
    return { success: false, error: "ファイルを選択してください" };
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  // Get old avatar URL before updating
  const { data: currentUser } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", user.id)
    .single();

  const oldAvatarUrl = currentUser?.avatar_url;

  // Update users table with new avatar URL
  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) {
    return {
      success: false,
      error: "アバター画像の保存に失敗しました。もう一度お試しください。",
    };
  }

  // Delete old avatar file (non-blocking)
  if (oldAvatarUrl) {
    try {
      const oldPath = oldAvatarUrl.split("/avatars/").pop();
      if (oldPath) {
        await supabase.storage.from("avatars").remove([oldPath]);
      }
    } catch {
      // Old avatar cleanup failure is non-critical
    }
  }

  return { success: true, data: { avatarUrl: publicUrl } };
}
