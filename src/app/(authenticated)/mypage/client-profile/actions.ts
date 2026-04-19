"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/action-result";
import {
  CLIENT_PROFILE_IMAGE_CONSTRAINTS,
  selectClientProfileSchema,
  type ClientProfileFormInput,
} from "@/lib/validations/client-profile";

interface SaveOpts {
  mode: "edit" | "setup";
  skip?: boolean;
}

type PlanType = "individual" | "small" | "corporate" | "corporate_premium";

/**
 * 操作者（Admin / Staff）の場合は所属組織 Owner の user_id を返す。
 * Owner 自身の場合は自身の user_id を返す。
 * 組織非所属の個人発注者は user_id 自身を返す。
 */
async function resolveProfileUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorUserId: string,
): Promise<string> {
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, org_role, organizations!inner(owner_id)")
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (!member) return actorUserId; // 個人発注者
  if (member.org_role === "owner") return actorUserId;

  const org = Array.isArray(member.organizations)
    ? member.organizations[0]
    : member.organizations;
  return (org as { owner_id: string } | null)?.owner_id ?? actorUserId;
}

async function getPlanType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileUserId: string,
): Promise<PlanType | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_type, status")
    .eq("user_id", profileUserId)
    .in("status", ["active", "past_due"])
    .maybeSingle();
  return (data?.plan_type as PlanType | undefined) ?? null;
}

/**
 * CLI-021 の保存 Server Action。
 * - mode="edit":  通常の編集。display_name のプラン別必須化を適用
 * - mode="setup": 課金直後の初回セットアップ。スキップ可（非法人プランのみ）
 *
 * 個人/小規模プランの setup で skip=true の場合は DB 書き込みを行わず
 * redirectTo='/mypage' を返す（Webhook のデフォルト display_name を維持）。
 */
export async function saveClientProfileAction(
  input: ClientProfileFormInput,
  opts: SaveOpts,
): Promise<ActionResult<{ redirectTo: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const profileUserId = await resolveProfileUserId(supabase, user.id);
  const planType = await getPlanType(supabase, profileUserId);

  // Webhook 未着時のガード（setup / edit ともに、プランが確定していないと保存できない）
  if (!planType) {
    return {
      success: false,
      error: "プラン情報を反映中です。数秒後にもう一度お試しください",
    };
  }

  const isCorporate =
    planType === "corporate" || planType === "corporate_premium";

  // setup モード + 非法人プラン + skip=true → DB 書き込みせず即 /mypage
  if (opts.mode === "setup" && opts.skip) {
    if (isCorporate) {
      return {
        success: false,
        error: "法人プランでは社名の入力が必要です",
      };
    }
    return { success: true, data: { redirectTo: "/mypage" } };
  }

  const schema = selectClientProfileSchema(planType);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります",
    };
  }

  const data = parsed.data;
  const upsertPayload = {
    user_id: profileUserId,
    display_name: data.displayName ?? null,
    address: data.address,
    image_url: data.imageUrl,
    recruit_job_types: data.recruitJobTypes,
    recruit_area: data.recruitArea,
    employee_scale: data.employeeScale,
    working_way: data.workingWay,
    language: data.language,
    message: data.message,
    sns_x: data.snsX,
    sns_instagram: data.snsInstagram,
    sns_tiktok: data.snsTiktok,
    sns_youtube: data.snsYoutube,
    sns_facebook: data.snsFacebook,
  };

  const { error } = await supabase
    .from("client_profiles")
    .upsert(upsertPayload, { onConflict: "user_id" });

  if (error) {
    return { success: false, error: "発注者情報の保存に失敗しました" };
  }

  revalidatePath("/mypage/client-profile");
  revalidatePath("/mypage/client-profile/edit");

  const redirectTo =
    opts.mode === "setup" ? "/mypage" : "/mypage/client-profile";
  return { success: true, data: { redirectTo } };
}

// ---------------------------------------------------------------------------
// 画像アップロード
// ---------------------------------------------------------------------------
export async function uploadClientProfileImageAction(
  formData: FormData,
): Promise<ActionResult<{ imageUrl: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "画像ファイルを選択してください" };
  }

  if (file.size > CLIENT_PROFILE_IMAGE_CONSTRAINTS.maxSize) {
    return { success: false, error: "画像は5MB以下にしてください" };
  }

  if (
    !CLIENT_PROFILE_IMAGE_CONSTRAINTS.allowedTypes.includes(
      file.type as (typeof CLIENT_PROFILE_IMAGE_CONSTRAINTS.allowedTypes)[number],
    )
  ) {
    return {
      success: false,
      error: "画像はJPEGまたはPNG形式のみ対応しています",
    };
  }

  const profileUserId = await resolveProfileUserId(supabase, user.id);
  const ext = file.type === "image/png" ? "png" : "jpg";
  const storagePath = `${profileUserId}/client-profile.${ext}`;

  // Storage は RLS で Owner/Admin のみ書き込み可（Task 2.5 の
  // avatars_client_profile_write_* ポリシー + is_org_admin_or_owner_of 関数）
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(storagePath, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { success: false, error: "画像のアップロードに失敗しました" };
  }

  const admin = createAdminClient();
  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(storagePath);

  return { success: true, data: { imageUrl: publicUrl } };
}
