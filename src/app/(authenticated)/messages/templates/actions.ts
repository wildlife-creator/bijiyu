"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";
import {
  scoutTemplateSchema,
  type ScoutTemplateInput,
} from "@/lib/validations/message";

/**
 * scout_templates のオーナー/組織を Server 側で確定するためのヘルパー。
 * 個人プランの場合 organization_id は NULL。法人プランの場合は所属組織 ID。
 */
async function resolveOwnerAndOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ ownerId: string; organizationId: string | null }> {
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    ownerId: userId,
    organizationId: member?.organization_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// createScoutTemplateAction
// ---------------------------------------------------------------------------
export async function createScoutTemplateAction(
  input: ScoutTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const parsed = scoutTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります",
    };
  }

  const { ownerId, organizationId } = await resolveOwnerAndOrg(supabase, user.id);

  const { data, error } = await supabase
    .from("scout_templates")
    .insert({
      owner_id: ownerId,
      organization_id: organizationId,
      title: parsed.data.title,
      body: parsed.data.body,
      memo: parsed.data.memo,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "テンプレートの作成に失敗しました" };
  }

  revalidatePath("/messages/templates");
  return { success: true, data: { id: data.id } };
}

// ---------------------------------------------------------------------------
// updateScoutTemplateAction
// ---------------------------------------------------------------------------
export async function updateScoutTemplateAction(
  id: string,
  input: ScoutTemplateInput,
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const parsed = scoutTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります",
    };
  }

  // RLS: 本人作成 or 同一組織メンバーのみ UPDATE 可
  const { error } = await supabase
    .from("scout_templates")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      memo: parsed.data.memo,
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: "テンプレートの更新に失敗しました" };
  }

  revalidatePath("/messages/templates");
  revalidatePath(`/messages/templates/${id}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteScoutTemplateAction
// ---------------------------------------------------------------------------
export async function deleteScoutTemplateAction(
  id: string,
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // RLS: 本人作成 or 同一組織メンバーのみ DELETE 可
  const { error } = await supabase
    .from("scout_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, error: "テンプレートの削除に失敗しました" };
  }

  revalidatePath("/messages/templates");
  return { success: true };
}
