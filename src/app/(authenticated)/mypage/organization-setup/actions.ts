"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";

const organizationNameSchema = z
  .string()
  .max(100, "組織名は100文字以内で入力してください")
  .transform((v) => v.trim())
  .pipe(z.string().min(1, "組織名を入力してください"));

export async function saveOrganizationNameAction(
  name: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "ログインしてください" };

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!userRow) return { success: false, error: "ユーザー情報が取得できません" };
  if (userRow.role !== "client") {
    return {
      success: false,
      error: "この操作は発注者アカウントのみ利用できます",
    };
  }

  const parsed = organizationNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const trimmedName = parsed.data;

  const admin = createAdminClient();

  // Find the organization owned by this user
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!org) {
    return {
      success: false,
      error: "組織情報が見つかりません",
    };
  }

  const { error: updateError } = await admin
    .from("organizations")
    .update({ name: trimmedName })
    .eq("id", org.id);

  if (updateError) {
    return {
      success: false,
      error: "組織名の更新に失敗しました",
    };
  }

  // audit_logs
  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "organization_name_set",
    target_type: "organization",
    target_id: org.id,
    metadata: { name: trimmedName },
  });

  redirect("/mypage?setup_completed=true");
}
