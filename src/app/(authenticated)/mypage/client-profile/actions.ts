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
import { validateLabelChanges } from "@/lib/master/validate";
import { validateAreaChanges } from "@/lib/master/validate-area";

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
  _supabase: Awaited<ReturnType<typeof createClient>>,
  profileUserId: string,
): Promise<PlanType | null> {
  // Admin が Owner 代理で保存するケースで、RLS により Owner subscription が
  // 見えないため admin client 経由で取得する
  const admin = createAdminClient();
  const { data } = await admin
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

  // 担当者（org_role='staff'）は発注者情報を編集できない（REQ-ORG-002: 閲覧のみ）。
  // Admin（org_role='admin'）は編集可。Middleware でも同じガードがあるが Server Action の二重防御。
  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("org_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (orgMember?.org_role === "staff") {
    return {
      success: false,
      error: "担当者は発注者情報を編集できません",
    };
  }

  const profileUserId = await resolveProfileUserId(supabase, user.id);
  const planType = await getPlanType(supabase, profileUserId);

  // プラン未確定ガード:
  // - edit モード or setup モード + skip=true → 恒久的に保存不可。contractor の
  //   URL 直打ち等も含めて「発注者プランに加入していない」旨を明示
  // - setup モード + 通常 save → Webhook race（課金直後）の正規経路なので
  //   soft retry メッセージを返す
  if (!planType) {
    if (opts.mode === "edit" || opts.skip === true) {
      return {
        success: false,
        error: "発注者プランに加入していないため、この画面は使用できません",
      };
    }
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

  // 募集職種 + 募集エリアの delta validate (added のみ active 必須、既存保有 deprecated 保持)
  const [{ data: prevProfile }, { data: prevAreas }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("recruit_job_types")
      .eq("user_id", profileUserId)
      .maybeSingle(),
    supabase
      .from("client_recruit_areas")
      .select("prefecture, municipality")
      .eq("client_id", profileUserId),
  ]);
  const prevRecruitJobTypes = (prevProfile?.recruit_job_types ?? []) as string[];
  const previousAreas = (prevAreas ?? []).map((r) => ({
    prefecture: r.prefecture,
    municipality: r.municipality,
  }));

  const [recruitValid, areaValid] = await Promise.all([
    validateLabelChanges(
      data.recruitJobTypes,
      prevRecruitJobTypes,
      "trade-types",
    ),
    validateAreaChanges(data.recruitArea, previousAreas),
  ]);
  if (!recruitValid.valid) {
    return {
      success: false,
      error:
        recruitValid.unknownLabels.length > 0
          ? `存在しない職種が含まれています: ${recruitValid.unknownLabels.join("、")}`
          : `廃止された職種は新規追加できません: ${recruitValid.deprecatedLabels.join("、")}`,
    };
  }
  if (!areaValid.valid) {
    const fmt = (a: { prefecture: string; municipality: string | null }) =>
      a.municipality ? `${a.prefecture}${a.municipality}` : a.prefecture;
    return {
      success: false,
      error:
        areaValid.unknownPairs.length > 0
          ? `存在しないエリアが含まれています: ${areaValid.unknownPairs.map(fmt).join("、")}`
          : `廃止されたエリアは新規追加できません: ${areaValid.deprecatedPairs.map(fmt).join("、")}`,
    };
  }

  // client_profiles は recruit_area カラムなしで upsert (Phase 6 で DROP 予定だが
  // 本 Phase 4 では writeを止めるだけにとどめる)。エリアは client_recruit_areas
  // 別テーブルへ replace_client_recruit_areas RPC で全置換
  const upsertPayload = {
    user_id: profileUserId,
    display_name: data.displayName ?? null,
    address: data.address,
    image_url: data.imageUrl,
    recruit_job_types: data.recruitJobTypes,
    employee_scale: data.employeeScale,
    working_way: data.workingWay.length > 0 ? data.workingWay : null,
    language: data.language.length > 0 ? data.language : null,
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

  const { error: areasError } = await supabase.rpc(
    "replace_client_recruit_areas",
    {
      p_client_id: profileUserId,
      p_areas: data.recruitArea,
    },
  );
  if (areasError) {
    return { success: false, error: "募集エリアの保存に失敗しました" };
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

  // 担当者（org_role='staff'）は画像アップロード不可（REQ-ORG-002: 閲覧のみ）。
  // Admin（org_role='admin'）は編集可。
  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("org_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (orgMember?.org_role === "staff") {
    return {
      success: false,
      error: "担当者は発注者情報を編集できません",
    };
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

  // Storage パスが `{uid}/client-profile.{ext}` で固定されるため、同一 URL が返り
  // ブラウザキャッシュで古い画像が表示されたままになる。cache buster を付与して
  // React state と DOM の画像を確実に差し替える。
  return { success: true, data: { imageUrl: `${publicUrl}?t=${Date.now()}` } };
}
