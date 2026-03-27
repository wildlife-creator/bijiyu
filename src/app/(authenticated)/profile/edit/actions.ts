"use server";

import { createClient } from "@/lib/supabase/server";
import {
  profileEditSchema,
  validateAvatarFile,
} from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

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
      companyName: formData.get("companyName"),
      bio: formData.get("bio"),
      skills: JSON.parse((formData.get("skills") as string) ?? "[]"),
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
        company_name: data.companyName ?? null,
        bio: data.bio ?? null,
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

    // Replace available areas
    await supabase
      .from("user_available_areas")
      .delete()
      .eq("user_id", user.id);
    if (data.availableAreas.length > 0) {
      const { error: areasError } = await supabase
        .from("user_available_areas")
        .insert(
          data.availableAreas.map((prefecture) => ({
            user_id: user.id,
            prefecture,
          }))
        );
      if (areasError) {
        return {
          success: false,
          error: "対応エリアの保存に失敗しました。もう一度お試しください。",
        };
      }
    }

    // Update email if provided and different from current
    if (data.email && data.email !== user.email) {
      const { error: emailError } = await supabase.auth.updateUser({
        email: data.email,
      });

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

  const file = formData.get("avatar");
  if (!file || !(file instanceof File)) {
    return { success: false, error: "ファイルを選択してください" };
  }

  // Validate MIME type and extension
  const validationError = validateAvatarFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Generate unique filename
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  // Upload to avatars bucket
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file);

  if (uploadError) {
    return {
      success: false,
      error: "アバター画像のアップロードに失敗しました。もう一度お試しください。",
    };
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
