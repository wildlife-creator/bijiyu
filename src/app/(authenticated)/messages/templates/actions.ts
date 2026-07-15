"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";
import {
  scoutTemplateSchema,
  type ScoutTemplateInput,
} from "@/lib/validations/message";

/**
 * scout_templates のオーナー/組織を Server 側で確定するためのヘルパー。
 * 個人プランの場合 organization_id は NULL。法人プランの場合は active 組織 ID。
 */
async function resolveOwnerAndOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ ownerId: string; organizationId: string | null }> {
  const { active } = await getActiveOrganizationContext(supabase);
  return {
    ownerId: userId,
    organizationId: active?.organizationId ?? null,
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

  // RLS（本人作成 or 所属組織）に加えて、アクティブ組織（法人でなければ
  // 本人分）のテンプレのみ更新可に絞る。複数組織所属の代理スタッフが
  // 別組織のテンプレを更新できてしまうのを防ぐ。
  // updated_by に実行ユーザーを記録（updated_at は set_updated_at トリガーが自動更新）
  const { active } = await getActiveOrganizationContext(supabase);

  let updateQuery = supabase
    .from("scout_templates")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      memo: parsed.data.memo,
      updated_by: user.id,
    })
    .eq("id", id);

  updateQuery = active
    ? updateQuery.eq("organization_id", active.organizationId)
    : updateQuery.eq("owner_id", user.id);

  // RLS / スコープ外は error なしの影響 0 行になるため .select() で検出する
  const { data: updatedRows, error } = await updateQuery.select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
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

  // RLS（本人作成 or 所属組織）に加えて、アクティブ組織（法人でなければ
  // 本人分）のテンプレのみ削除可に絞る
  const { active } = await getActiveOrganizationContext(supabase);

  let deleteQuery = supabase
    .from("scout_templates")
    .delete()
    .eq("id", id);

  deleteQuery = active
    ? deleteQuery.eq("organization_id", active.organizationId)
    : deleteQuery.eq("owner_id", user.id);

  // RLS / スコープ外は error なしの影響 0 行になるため .select() で検出する
  const { data: deletedRows, error } = await deleteQuery.select("id");

  if (error || !deletedRows || deletedRows.length === 0) {
    return { success: false, error: "テンプレートの削除に失敗しました" };
  }

  revalidatePath("/messages/templates");
  return { success: true };
}
