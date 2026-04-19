"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_LIMITS, type PlanType } from "@/lib/constants/plans";
import type { ActionResult } from "@/lib/types/action-result";
import {
  memberCreateSchema,
  memberUpdateSchema,
  type MemberCreateInput,
  type MemberUpdateInput,
} from "@/lib/validations/member";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Helper: actor context
// ---------------------------------------------------------------------------
async function getActorContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, org_role, organizations!inner(owner_id)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) return null;

  const org = Array.isArray(member.organizations)
    ? member.organizations[0]
    : member.organizations;
  const orgOwnerId = (org as { owner_id: string } | null)?.owner_id ?? null;

  return {
    userId: user.id,
    organizationId: member.organization_id as string,
    orgRole: member.org_role as "owner" | "admin" | "staff",
    orgOwnerId: orgOwnerId as string,
  };
}

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("audit_logs")
    .insert({
      actor_id: actorId,
      action,
      target_type: "user",
      target_id: (details.target_user_id as string) ?? null,
      metadata: details,
    })
    .then(
      () => {},
      (err) => console.error("[audit_logs] insert failed", err),
    );
}

// ---------------------------------------------------------------------------
// createMemberAction
// ---------------------------------------------------------------------------
export async function createMemberAction(
  input: MemberCreateInput,
): Promise<ActionResult<{ userId: string }>> {
  const supabase = await createClient();
  const actor = await getActorContext(supabase);
  if (!actor) return { success: false, error: "認証が必要です" };

  // 権限: owner / admin のみ
  if (actor.orgRole !== "owner" && actor.orgRole !== "admin") {
    return { success: false, error: "担当者の作成権限がありません" };
  }

  // admin が admin を作成しようとした場合は拒否
  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります",
    };
  }
  if (actor.orgRole === "admin" && parsed.data.orgRole === "admin") {
    return {
      success: false,
      error: "管理者の作成は管理責任者のみが行えます",
    };
  }

  const admin = createAdminClient();

  // R2: メール重複事前チェック（public.users.email + idx_users_email で O(log N)）
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (existingUser) {
    return {
      success: false,
      error: "このメールアドレスは既に登録されています",
    };
  }

  // プラン種別から maxStaff を取得
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("plan_type")
    .eq("user_id", actor.orgOwnerId)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  const planType = (subscription?.plan_type as PlanType | undefined) ?? null;
  if (!planType) {
    return { success: false, error: "プラン情報を取得できませんでした" };
  }
  const maxStaff = PLAN_LIMITS[planType]?.maxStaff ?? 0;
  if (maxStaff === 0) {
    return {
      success: false,
      error: "現在のプランでは担当者を追加できません",
    };
  }

  // 招待メール送信 + auth.users 作成（D 対応: メタデータで staff + 氏名を自動設定）
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${SERVICE_URL}/auth/callback?type=invite`,
      data: {
        invited_role: "staff",
        invited_last_name: parsed.data.lastName,
        invited_first_name: parsed.data.firstName,
      },
    });

  if (inviteError || !invited.user) {
    console.error("[createMemberAction] inviteUserByEmail failed", inviteError);
    return {
      success: false,
      error: "招待メールの送信に失敗しました。時間をおいて再度お試しください",
    };
  }

  const newUserId = invited.user.id;

  // insert_staff_member_with_limit RPC（atomic: FOR UPDATE ロック + 上限 + 代理一意性チェック）
  const { error: rpcError } = await admin.rpc("insert_staff_member_with_limit", {
    p_user_id: newUserId,
    p_organization_id: actor.organizationId,
    p_org_role: parsed.data.orgRole,
    p_is_proxy_account: parsed.data.isProxyAccount,
    p_max_staff: maxStaff,
  });

  if (rpcError) {
    // クリーンアップ: auth.users を削除（孤児防止）
    const { error: cleanupError } = await admin.auth.admin.deleteUser(newUserId);
    if (cleanupError) {
      await logAudit(admin, actor.userId, "member_create_failed_cleanup_failed", {
        target_user_id: newUserId,
        email: parsed.data.email,
        organization_id: actor.organizationId,
        rpc_error: rpcError.message,
        cleanup_error: cleanupError.message,
      });
    } else {
      await logAudit(admin, actor.userId, "member_create_failed_cleanup_pending", {
        target_user_id: newUserId,
        rpc_error: rpcError.message,
      });
    }

    // 日本語エラーマッピング
    const msg = rpcError.message || "";
    if (msg.includes("STAFF_LIMIT_EXCEEDED")) {
      return {
        success: false,
        error: `担当者の上限（${maxStaff}人）に達しています。プランのアップグレードをご検討ください`,
      };
    }
    if (msg.includes("PROXY_ACCOUNT_ALREADY_EXISTS")) {
      return {
        success: false,
        error:
          "代理アカウントは既に登録されています。既存の代理アカウントを解除してから再度お試しください",
      };
    }
    if (msg.includes("INVALID_ORG_ROLE")) {
      return { success: false, error: "権限の指定が不正です" };
    }
    if (msg.includes("USER_NOT_FOUND") || msg.includes("ORGANIZATION_NOT_FOUND")) {
      return { success: false, error: "担当者の作成に失敗しました。再度お試しください" };
    }
    return {
      success: false,
      error: "担当者の作成に失敗しました。時間をおいて再度お試しください",
    };
  }

  await logAudit(admin, actor.userId, "member_created", {
    target_user_id: newUserId,
    email: parsed.data.email,
    organization_id: actor.organizationId,
    org_role: parsed.data.orgRole,
  });

  revalidatePath("/mypage/members");
  return { success: true, data: { userId: newUserId } };
}

// ---------------------------------------------------------------------------
// updateMemberAction
// ---------------------------------------------------------------------------
export async function updateMemberAction(
  targetUserId: string,
  input: MemberUpdateInput,
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const actor = await getActorContext(supabase);
  if (!actor) return { success: false, error: "認証が必要です" };

  const parsed = memberUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります",
    };
  }

  const admin = createAdminClient();

  // 対象メンバーの所属確認
  const { data: target } = await admin
    .from("organization_members")
    .select("organization_id, org_role, is_proxy_account, user_id")
    .eq("user_id", targetUserId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();

  if (!target) {
    return { success: false, error: "対象の担当者が見つかりません" };
  }

  const isSelfEdit = targetUserId === actor.userId;

  // 権限チェック
  if (!isSelfEdit) {
    // 他人を編集するのは owner / admin のみ、かつ下位ロールに限る
    if (actor.orgRole !== "owner" && actor.orgRole !== "admin") {
      return { success: false, error: "編集権限がありません" };
    }
    if (target.org_role === "owner") {
      return { success: false, error: "管理責任者は本画面で編集できません" };
    }
    if (actor.orgRole === "admin" && target.org_role === "admin") {
      return { success: false, error: "管理者の編集は管理責任者のみ可能です" };
    }
  }

  // 代理アカウント切替時の一意性事前チェック
  if (parsed.data.isProxyAccount === true && !target.is_proxy_account) {
    const { data: existingProxy } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", actor.organizationId)
      .eq("is_proxy_account", true)
      .neq("user_id", targetUserId)
      .maybeSingle();
    if (existingProxy) {
      return {
        success: false,
        error:
          "代理アカウントは既に登録されています。既存の代理アカウントを解除してから再度お試しください",
      };
    }
  }

  // 氏名更新
  if (parsed.data.lastName !== undefined || parsed.data.firstName !== undefined) {
    const { error: nameError } = await admin
      .from("users")
      .update({
        ...(parsed.data.lastName !== undefined
          ? { last_name: parsed.data.lastName }
          : {}),
        ...(parsed.data.firstName !== undefined
          ? { first_name: parsed.data.firstName }
          : {}),
      })
      .eq("id", targetUserId);
    if (nameError) {
      return { success: false, error: "氏名の更新に失敗しました" };
    }
  }

  // メール更新（自己編集 vs 管理者変更で分岐）
  if (parsed.data.email) {
    if (isSelfEdit) {
      // パターン A: 本人のセッションで auth.updateUser
      const { error: emailError } = await supabase.auth.updateUser({
        email: parsed.data.email,
      });
      if (emailError) {
        return { success: false, error: "メールアドレスの変更に失敗しました" };
      }
    } else {
      // パターン B: admin client で強制変更
      const { error: emailError } = await admin.auth.admin.updateUserById(
        targetUserId,
        { email: parsed.data.email, email_confirm: true },
      );
      if (emailError) {
        return { success: false, error: "メールアドレスの変更に失敗しました" };
      }
      await logAudit(admin, actor.userId, "email_changed_by_admin", {
        target_user_id: targetUserId,
        new_email: parsed.data.email,
        organization_id: actor.organizationId,
      });
      // 通知メール送信は別コミット（Task 14.3）で追加予定
    }
  }

  // 権限 / 代理フラグ更新
  const memberUpdates: Record<string, unknown> = {};
  if (parsed.data.orgRole !== undefined && !isSelfEdit) {
    memberUpdates.org_role = parsed.data.orgRole;
  }
  if (parsed.data.isProxyAccount !== undefined && !isSelfEdit) {
    memberUpdates.is_proxy_account = parsed.data.isProxyAccount;
  }
  if (Object.keys(memberUpdates).length > 0) {
    const { error: memberError } = await admin
      .from("organization_members")
      .update(memberUpdates)
      .eq("user_id", targetUserId)
      .eq("organization_id", actor.organizationId);
    if (memberError) {
      // DB の部分 UNIQUE 制約（23505）で代理重複を最終ガード
      if (memberError.code === "23505") {
        return {
          success: false,
          error:
            "代理アカウントは既に登録されています。既存の代理アカウントを解除してから再度お試しください",
        };
      }
      return { success: false, error: "権限の更新に失敗しました" };
    }
  }

  revalidatePath("/mypage/members");
  revalidatePath(`/mypage/members/${targetUserId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteMemberAction
// ---------------------------------------------------------------------------
export async function deleteMemberAction(
  targetUserId: string,
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const actor = await getActorContext(supabase);
  if (!actor) return { success: false, error: "認証が必要です" };

  if (actor.orgRole !== "owner" && actor.orgRole !== "admin") {
    return { success: false, error: "削除権限がありません" };
  }
  if (targetUserId === actor.userId) {
    return { success: false, error: "自身を削除することはできません" };
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("organization_members")
    .select("org_role")
    .eq("user_id", targetUserId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();

  if (!target) {
    return { success: false, error: "対象の担当者が見つかりません" };
  }
  if (target.org_role === "owner") {
    return { success: false, error: "管理責任者は削除できません" };
  }
  if (actor.orgRole === "admin" && target.org_role === "admin") {
    return { success: false, error: "管理者の削除は管理責任者のみ可能です" };
  }

  const { error } = await admin.rpc("delete_staff_member", {
    p_target_user_id: targetUserId,
    p_organization_id: actor.organizationId,
    p_owner_user_id: actor.orgOwnerId,
  });

  if (error) {
    return { success: false, error: "担当者の削除に失敗しました" };
  }

  await logAudit(admin, actor.userId, "member_deleted", {
    target_user_id: targetUserId,
    organization_id: actor.organizationId,
  });

  revalidatePath("/mypage/members");
  return { success: true };
}

// ---------------------------------------------------------------------------
// resendInviteAction
// ---------------------------------------------------------------------------
export async function resendInviteAction(
  targetUserId: string,
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const actor = await getActorContext(supabase);
  if (!actor) return { success: false, error: "認証が必要です" };

  if (actor.orgRole !== "owner" && actor.orgRole !== "admin") {
    return { success: false, error: "再送権限がありません" };
  }

  const admin = createAdminClient();

  // 対象の public.users を取得し、password_set_at が NULL（未完了）か確認
  const { data: target } = await admin
    .from("users")
    .select("id, email, password_set_at")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!target) {
    return { success: false, error: "対象のユーザーが見つかりません" };
  }
  if (target.password_set_at !== null) {
    return { success: false, error: "このユーザーは既に招待を完了しています" };
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(target.email, {
    redirectTo: `${SERVICE_URL}/auth/callback?type=invite`,
  });

  if (error) {
    return {
      success: false,
      error: "招待メールの再送に失敗しました。時間をおいて再度お試しください",
    };
  }

  return { success: true };
}
