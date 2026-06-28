"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_LIMITS, type PlanType } from "@/lib/constants/plans";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import type { ActionResult } from "@/lib/types/action-result";
import type { Json } from "@/types/database";
import {
  memberCreateSchema,
  memberUpdateSchema,
  memberErrorMessages,
  type MemberCreateInput,
  type MemberUpdateInput,
} from "@/lib/validations/member";
import { sendEmail } from "@/lib/email/send-email";
import { emailChangedByAdminEmail } from "@/lib/email/templates/email-changed-by-admin";
import { emailChangedByAdminControlEmail } from "@/lib/email/templates/email-changed-by-admin-control";
import { memberInvitedControlEmail } from "@/lib/email/templates/member-invited-control";
import { proxyAssignedExistingUserEmail } from "@/lib/email/templates/proxy-assigned-existing-user";
import { getOrganizationManagementRecipients } from "@/lib/email/recipients/organization-managers";
import { resolveExistingProxyReuse } from "@/lib/organization/resolve-existing-proxy-reuse";
import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";

const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Helper: actor context
//
// proxy-account-multi-org-support Phase 3 / Task 3.1:
// `.maybeSingle()` で直接 `organization_members` を引く旧パターンを廃止し、
// `getActiveOrganizationContext` 経由で組織コンテキストを解決する。
// 単一組織ユーザーには Cookie が無視されるため既存挙動と完全等価。
// ---------------------------------------------------------------------------
async function getActorContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { active } = await getActiveOrganizationContext(supabase);
  if (!active) return null;

  return {
    userId: user.id,
    organizationId: active.organizationId,
    orgRole: active.orgRole,
    orgOwnerId: active.orgOwnerId,
  };
}

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  action: string,
  details: Record<string, Json>,
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

  // R6 二重防衛: UI バイパス / 改竄リクエストに備え、入力段階で
  // 代理 + admin の組み合わせを Zod に依存せず明示拒否する。
  // Zod superRefine も同条件で issue を出すが、ここを残すことで
  // 「将来 schema を直接書き換えた場合の安全網」として機能させる。
  if (input.isProxyAccount === true && input.orgRole === "admin") {
    return {
      success: false,
      error: memberErrorMessages.proxyAdminCombination,
    };
  }

  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります",
    };
  }
  // admin が admin を作成しようとした場合は拒否
  if (actor.orgRole === "admin" && parsed.data.orgRole === "admin") {
    return {
      success: false,
      error: "管理者の作成は管理責任者のみが行えます",
    };
  }

  const admin = createAdminClient();

  // R2 (proxy-account-multi-org-support Phase 6): 既存ユーザー再利用判定
  //   - 新規ユーザー → 現状通り invite + RPC
  //   - 既存代理 + 同名 + isProxyAccount=true → 既存 user_id で RPC + 通知メール
  //   - 既存ユーザー (代理ではない / 招待が通常スタッフ) → reject_email_taken
  //   - 既存代理 + 氏名不一致 → reject_name_mismatch (既存氏名は応答に含めない)
  const reuseDecision = await resolveExistingProxyReuse(admin, {
    email: parsed.data.email,
    lastName: parsed.data.lastName,
    firstName: parsed.data.firstName,
    isProxyAccount: parsed.data.isProxyAccount,
  });

  if (reuseDecision.kind === "reject_email_taken") {
    return {
      success: false,
      error: "このメールアドレスは既に登録されています",
    };
  }

  if (reuseDecision.kind === "reject_name_mismatch") {
    return {
      success: false,
      error:
        "このメールアドレスは既に違うお名前で登録されています。お名前をご確認の上、再度お試しください",
    };
  }

  const isReusePath = reuseDecision.kind === "reuse_existing_proxy";

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

  // 招待メール送信 + auth.users 作成 (新規ユーザーのみ。reuse パスでは既存
  // user_id を使うため inviteUserByEmail はスキップする)
  //
  // 新規パス:
  //   redirectTo は /auth/callback を経由せず直接 /accept-invite/confirm に向ける。
  //   AUTH-008 は client component で createBrowserClient 経由で session を確立できるため、
  //   implicit flow のトークン (URL fragment / Cookie) を素直に受けられる。
  let newUserId: string;
  if (isReusePath) {
    newUserId = reuseDecision.userId;
  } else {
    // §5.1 招待テンプレ（supabase/templates/invite.html）の Go template が
    // 参照する metadata を解決する。Staff / Proxy 共通で必要:
    //   - invited_org_name: Owner の client_profiles.display_name（CLI-021 で登録した社名）
    //   - invited_by_name : 操作者の users.姓名（スペースなし結合）
    //   - invited_at      : 操作タイムスタンプ（YYYY/MM/DD HH:MM、テンプレで【設定日時】として表示）
    //   - is_proxy_account: テンプレ分岐キー
    const [ownerProfileRes, actorRes] = await Promise.all([
      admin
        .from("client_profiles")
        .select("display_name")
        .eq("user_id", actor.orgOwnerId)
        .maybeSingle(),
      admin
        .from("users")
        .select("last_name, first_name")
        .eq("id", actor.userId)
        .maybeSingle(),
    ]);
    const invitedOrgName =
      ownerProfileRes.data?.display_name?.trim() || "ビジ友組織";
    const invitedByName =
      `${actorRes.data?.last_name ?? ""}${actorRes.data?.first_name ?? ""}`.trim() ||
      "管理者";
    const invitedAt = formatJapaneseDateTime(new Date());

    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
        redirectTo: `${SERVICE_URL}/accept-invite/confirm`,
        data: {
          invited_role: "staff",
          invited_last_name: parsed.data.lastName,
          invited_first_name: parsed.data.firstName,
          invited_org_name: invitedOrgName,
          invited_by_name: invitedByName,
          invited_at: invitedAt,
          is_proxy_account: parsed.data.isProxyAccount,
        },
      });

    if (inviteError || !invited.user) {
      console.error("[createMemberAction] inviteUserByEmail failed", inviteError);
      return {
        success: false,
        error: "招待メールの送信に失敗しました。時間をおいて再度お試しください",
      };
    }

    newUserId = invited.user.id;
  }

  // insert_staff_member_with_limit RPC（atomic: FOR UPDATE ロック + 上限 + 代理一意性チェック）
  const { error: rpcError } = await admin.rpc("insert_staff_member_with_limit", {
    p_user_id: newUserId,
    p_organization_id: actor.organizationId,
    p_org_role: parsed.data.orgRole,
    p_is_proxy_account: parsed.data.isProxyAccount,
    p_max_staff: maxStaff,
  });

  if (rpcError) {
    // クリーンアップ: 新規パスでのみ auth.users を削除 (孤児防止)
    // reuse パスでは auth.users を作成していないため cleanup 不要
    if (isReusePath) {
      await logAudit(admin, actor.userId, "member_create_failed_reuse_path", {
        target_user_id: newUserId,
        email: parsed.data.email,
        organization_id: actor.organizationId,
        rpc_error: rpcError.message,
        reuse_existing_user: true,
      });

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
      return {
        success: false,
        error: "担当者の追加に失敗しました。時間をおいて再度お試しください",
      };
    }

    const { error: cleanupError } = await admin.auth.admin.deleteUser(newUserId);
    if (cleanupError) {
      await logAudit(admin, actor.userId, "member_create_failed_cleanup_failed", {
        target_user_id: newUserId,
        email: parsed.data.email,
        organization_id: actor.organizationId,
        rpc_error: rpcError.message,
        cleanup_error: cleanupError.message,
      });
      // Task 14.2: 運営通知メール（孤児発生の即時アラート）
      const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
      if (opsEmail) {
        sendEmail({
          to: opsEmail,
          subject: "【要対応】担当者作成のクリーンアップ失敗",
          html: `<p>担当者作成で RPC 失敗 + auth.users 削除失敗が発生しました。孤児 auth.users が残っている可能性があります。</p>
<ul>
  <li>auth_user_id: ${newUserId}</li>
  <li>email: ${parsed.data.email}</li>
  <li>organization_id: ${actor.organizationId}</li>
  <li>rpc_error: ${rpcError.message}</li>
  <li>cleanup_error: ${cleanupError.message}</li>
</ul>
<p>対応手順は docs/operations/orphan-auth-users-playbook.md を参照してください。</p>`,
        }).catch((err) => {
          console.error(
            "[createMemberAction] OPS notification email failed",
            err,
          );
        });
      }
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
    ...(isReusePath ? { reuse_existing_user: true } : {}),
  });

  // 既存ユーザー再利用パスの通知メール送信 (proxy-assigned-existing-user)
  // 失敗してもメイン処理はロールバックしない (DB 登録は成功済み、運用通知扱い)
  if (isReusePath) {
    await sendProxyAssignedEmail({
      admin,
      targetUserId: newUserId,
      recipientEmail: parsed.data.email,
      orgOwnerId: actor.orgOwnerId,
      actorUserId: actor.userId,
    });
  }

  // §5.2.A 担当者招待の組織管理層 broadcast (通常 staff 招待のみ)。
  //   - 代理招待 / reuse パスは §5.6.D で別経路カバーのためここでは飛ばさない
  //   - 失敗しても DB 登録は完了済みなので Server Action は成功扱い
  if (!isReusePath && !parsed.data.isProxyAccount) {
    await sendMemberInvitedControl({
      admin,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      memberName: `${parsed.data.lastName}${parsed.data.firstName}`,
      memberEmail: parsed.data.email,
      roleLabel: parsed.data.orgRole === "admin" ? "管理者" : "担当者",
    });
  }

  revalidatePath("/mypage/members");
  return { success: true, data: { userId: newUserId } };
}

// ---------------------------------------------------------------------------
// Helper: existing ユーザー再利用パスの通知メール送信
// proxy-account-multi-org-support Phase 6 / Task 6.2 + 6.3
// ---------------------------------------------------------------------------
async function sendProxyAssignedEmail(params: {
  admin: ReturnType<typeof createAdminClient>;
  targetUserId: string;
  recipientEmail: string;
  orgOwnerId: string;
  actorUserId: string;
}): Promise<void> {
  const { admin, targetUserId, recipientEmail, orgOwnerId, actorUserId } = params;

  try {
    const [targetRes, ownerProfileRes, actorRes] = await Promise.all([
      admin
        .from("users")
        .select("last_name, first_name")
        .eq("id", targetUserId)
        .maybeSingle(),
      admin
        .from("client_profiles")
        .select("display_name")
        .eq("user_id", orgOwnerId)
        .maybeSingle(),
      admin
        .from("users")
        .select("last_name, first_name")
        .eq("id", actorUserId)
        .maybeSingle(),
    ]);

    const recipientName =
      `${targetRes.data?.last_name ?? ""}${targetRes.data?.first_name ?? ""}`.trim() ||
      "ご担当者";
    const organizationName =
      ownerProfileRes.data?.display_name?.trim() || "ビジ友組織";
    const actorName =
      `${actorRes.data?.last_name ?? ""}${actorRes.data?.first_name ?? ""}`.trim() ||
      "管理者";
    const now = new Date();
    const assignedAt = formatJapaneseDateTime(now);

    const { subject, html } = proxyAssignedExistingUserEmail({
      recipientName,
      organizationName,
      actorName,
      assignedAt,
    });

    await sendEmail({ to: recipientEmail, subject, html });
  } catch (err) {
    console.error(
      "[createMemberAction] proxy-assigned-existing-user email failed",
      err,
    );
  }
}

function formatJapaneseDateTime(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

// ---------------------------------------------------------------------------
// Helper: §5.2.A 担当者招待 control broadcast
// 通常 staff 招待時のみ呼ばれる。組織の Owner + admin (操作者含む) 全員に
// 1 通ずつ送信し、失敗は console.error のみで握り潰す (Server Action 自体は成功)。
// ---------------------------------------------------------------------------
async function sendMemberInvitedControl(params: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  actorUserId: string;
  memberName: string;
  memberEmail: string;
  roleLabel: string;
}): Promise<void> {
  const { admin, organizationId, actorUserId, memberName, memberEmail, roleLabel } = params;

  try {
    const recipients = await getOrganizationManagementRecipients(
      admin,
      organizationId,
    );
    if (recipients.length === 0) return;

    const { data: actorRow } = await admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", actorUserId)
      .maybeSingle();
    const actorName =
      `${actorRow?.last_name ?? ""}${actorRow?.first_name ?? ""}`.trim() ||
      "管理者";

    const invitedAt = formatJapaneseDateTime(new Date());

    await Promise.all(
      recipients.map((r) => {
        const { subject, html } = memberInvitedControlEmail({
          recipientName: r.displayName,
          memberName,
          memberEmail,
          roleLabel,
          isProxyLabel: "いいえ",
          actorName,
          invitedAt,
        });
        return sendEmail({ to: r.email, subject, html });
      }),
    );
  } catch (err) {
    console.error(
      "[createMemberAction] member-invited-control broadcast failed",
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: §5.4.B email-changed-by-admin control broadcast
// updateMemberAction パターン B (admin client での強制 email 変更) 成功時、
// 組織の Owner + admin (操作者含む、変更対象本人は除外) に控えメール送信。
// 失敗は console.error のみで握り潰す (Server Action 自体は成功)。
// ---------------------------------------------------------------------------
async function sendEmailChangedByAdminControl(params: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  targetName: string;
  oldEmail: string;
  newEmail: string;
}): Promise<void> {
  const {
    admin,
    organizationId,
    actorUserId,
    targetUserId,
    targetName,
    oldEmail,
    newEmail,
  } = params;

  try {
    const recipients = await getOrganizationManagementRecipients(
      admin,
      organizationId,
      [targetUserId],
    );
    if (recipients.length === 0) return;

    const { data: actorRow } = await admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", actorUserId)
      .maybeSingle();
    const actorName =
      `${actorRow?.last_name ?? ""}${actorRow?.first_name ?? ""}`.trim() ||
      "管理者";

    const changedAt = formatJapaneseDateTime(new Date());

    await Promise.all(
      recipients.map((r) => {
        const { subject, html } = emailChangedByAdminControlEmail({
          recipientName: r.displayName,
          targetName,
          oldEmail,
          newEmail,
          actorName,
          changedAt,
        });
        return sendEmail({ to: r.email, subject, html });
      }),
    );
  } catch (err) {
    console.error(
      "[updateMemberAction] §5.4.B email-changed-by-admin-control broadcast failed",
      err,
    );
  }
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

  // R6 二重防衛: UI バイパス / 改竄リクエストに備え、入力段階で
  // 代理 + admin の組み合わせを Zod に依存せず明示拒否する。
  if (input.isProxyAccount === true && input.orgRole === "admin") {
    return {
      success: false,
      error: memberErrorMessages.proxyAdminCombination,
    };
  }

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
      // 旧メール + 対象氏名 + 組織名を Email 通知に載せるため事前取得
      const { data: oldUser } = await admin
        .from("users")
        .select("email, last_name, first_name")
        .eq("id", targetUserId)
        .maybeSingle();
      const oldEmail = oldUser?.email ?? "";

      const { error: emailError } = await admin.auth.admin.updateUserById(
        targetUserId,
        { email: parsed.data.email, email_confirm: true },
      );
      if (emailError) {
        return { success: false, error: "メールアドレスの変更に失敗しました" };
      }
      await logAudit(admin, actor.userId, "email_changed_by_admin", {
        target_user_id: targetUserId,
        old_email: oldEmail,
        new_email: parsed.data.email,
        organization_id: actor.organizationId,
      });

      // Task 14.3: 旧・新両方のメールに通知。失敗してもロールバックしない
      const { data: orgRow } = await admin
        .from("organizations")
        .select("id, owner_user:users!owner_id(id)")
        .eq("id", actor.organizationId)
        .maybeSingle();
      const ownerUserId =
        (
          (Array.isArray(orgRow?.owner_user)
            ? orgRow?.owner_user[0]
            : orgRow?.owner_user) as { id: string } | undefined
        )?.id ?? null;
      const { data: orgClientProfile } = ownerUserId
        ? await admin
            .from("client_profiles")
            .select("display_name")
            .eq("user_id", ownerUserId)
            .maybeSingle()
        : { data: null };
      const organizationName =
        orgClientProfile?.display_name?.trim() || "ビジ友組織";

      const recipientName =
        `${oldUser?.last_name ?? ""}${oldUser?.first_name ?? ""}`.trim() ||
        "ご担当者";
      const { subject, html } = emailChangedByAdminEmail({
        recipientName,
        oldEmail,
        newEmail: parsed.data.email,
        organizationName,
      });

      const recipients = [oldEmail, parsed.data.email].filter(
        (e) => e && e.length > 0,
      );
      for (const to of recipients) {
        sendEmail({ to, subject, html }).catch((err) => {
          console.error("[updateMemberAction] notify email failed", err, to);
          logAudit(admin, actor.userId, "email_changed_by_admin_notify_failed", {
            target_user_id: targetUserId,
            recipient: to,
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
        });
      }

      // §5.4.B 組織管理層宛 control mail (変更対象本人は除外)。
      //   - excludeUserIds に [targetUserId] を渡し §5.4.A 受信と二重にしない
      //   - 失敗は console.error のみで握り潰す (DB 更新は完了済み)
      await sendEmailChangedByAdminControl({
        admin,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        targetUserId,
        targetName:
          `${oldUser?.last_name ?? ""}${oldUser?.first_name ?? ""}`.trim() ||
          "ご担当者",
        oldEmail,
        newEmail: parsed.data.email,
      });
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

  const { data, error } = await admin.rpc("delete_staff_member", {
    p_target_user_id: targetUserId,
    p_organization_id: actor.organizationId,
    p_owner_user_id: actor.orgOwnerId,
  });

  if (error) {
    return { success: false, error: "担当者の削除に失敗しました" };
  }

  // delete_staff_member v3: 戻り値 jsonb は { user_id, globally_deleted }。
  // globally_deleted=true（本 RPC で users.deleted_at が NULL → now() に遷移）の
  // ときのみ auth.users.email を印付け書き換えして元のメールアドレスを解放する。
  // 印付け失敗は削除自体の成功を維持する（audit_logs.auth_email_recycle_failed
  // で運用が後追いできる）。
  const result = data as { user_id: string; globally_deleted: boolean } | null;
  if (result?.globally_deleted === true) {
    try {
      await applyDeletedSuffix(admin, targetUserId, {
        path: "staff_delete",
        actorId: actor.userId,
      });
    } catch (e) {
      console.error("[deleteMemberAction] applyDeletedSuffix unexpected throw", e);
    }
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
    redirectTo: `${SERVICE_URL}/accept-invite/confirm`,
  });

  if (error) {
    console.error("[resendInviteAction] inviteUserByEmail failed", {
      email: target.email,
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      error: "招待メールの再送に失敗しました。時間をおいて再度お試しください",
    };
  }

  return { success: true };
}
