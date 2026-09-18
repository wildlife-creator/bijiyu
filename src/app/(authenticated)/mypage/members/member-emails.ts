/**
 * 担当者管理（CLI-022〜024）の Server Action から送るメールをまとめたモジュール。
 * 招待 / 権限変更 / 削除 / メール変更 / 代理アカウント割り当て の通知を組み立てて送る。
 * 処理本体は actions.ts。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { formatDateTime } from "@/lib/utils/format-date";
import {
  emailChangedByAdminControlEmail,
} from "@/lib/email/templates/email-changed-by-admin-control";
import { memberInvitedControlEmail } from "@/lib/email/templates/member-invited-control";
import { memberRoleChangedEmail } from "@/lib/email/templates/member-role-changed";
import {
  memberRoleChangedControlEmail,
} from "@/lib/email/templates/member-role-changed-control";
import { proxyAssignedEmail } from "@/lib/email/templates/proxy-assigned";
import { proxyAssignedControlEmail } from "@/lib/email/templates/proxy-assigned-control";
import { proxyRemovedEmail } from "@/lib/email/templates/proxy-removed";
import { proxyRemovedControlEmail } from "@/lib/email/templates/proxy-removed-control";
import { staffRemovedEmail } from "@/lib/email/templates/staff-removed";
import { staffRemovedControlEmail } from "@/lib/email/templates/staff-removed-control";
import {
  getOrganizationManagementRecipients,
} from "@/lib/email/recipients/organization-managers";

export function roleLabel(role: "owner" | "admin" | "staff" | string): string {
  if (role === "admin") return "管理者";
  if (role === "staff") return "担当者";
  if (role === "owner") return "管理責任者";
  return role;
}

export const SERVICE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

// ---------------------------------------------------------------------------
// Helper: §5.6.C + §5.6.D 代理アカウント設定通知 (bundle)
//
// §5.6.C 本人宛 (ビジ友運営スタッフ宛) と §5.6.D 法人 Owner+admin 宛 broadcast を
// 一括送信する共通ヘルパー。3 シナリオで使用:
//   - createMemberAction 新規招待 + isProxyAccount=true: sendToTarget=false
//     (本人宛は §5.1-Proxy が単独でカバー、§5.6.C は飛ばない)
//   - createMemberAction reuse パス (既存代理が別組織に追加): sendToTarget=true
//   - updateMemberAction 代理 ON 切替 (false→true): sendToTarget=true
//
// 失敗は console.error のみで握り潰す (Server Action 自体は成功)。
// ---------------------------------------------------------------------------
export async function sendProxyAssignedBundle(params: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  targetUserId: string;
  recipientEmail: string;
  orgOwnerId: string;
  actorUserId: string;
  /** false で §5.6.C 本人宛を skip (新規招待時、§5.1-Proxy で完結する場合のみ) */
  sendToTarget: boolean;
}): Promise<void> {
  const {
    admin,
    organizationId,
    targetUserId,
    recipientEmail,
    orgOwnerId,
    actorUserId,
    sendToTarget,
  } = params;

  try {
    const [targetRes, ownerProfileRes, actorRes, recipients] = await Promise.all([
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
      getOrganizationManagementRecipients(admin, organizationId, [targetUserId]),
    ]);

    const recipientName =
      `${targetRes.data?.last_name ?? ""}${targetRes.data?.first_name ?? ""}`.trim() ||
      "ご担当者";
    const organizationName =
      ownerProfileRes.data?.display_name?.trim() || "ビジ友組織";
    const actorName =
      `${actorRes.data?.last_name ?? ""}${actorRes.data?.first_name ?? ""}`.trim() ||
      "管理者";
    const assignedAt = formatDateTime(new Date().toISOString());

    const tasks: Promise<unknown>[] = [];

    // §5.6.C 本人宛 (sendToTarget=true のみ)
    if (sendToTarget && recipientEmail) {
      const { subject, html } = proxyAssignedEmail({
        recipientName,
        organizationName,
        actorName,
        assignedAt,
      });
      tasks.push(sendEmail({ to: recipientEmail, subject, html }));
    }

    // §5.6.D 法人 Owner + admin 宛 broadcast
    for (const r of recipients) {
      const { subject, html } = proxyAssignedControlEmail({
        recipientName: r.displayName,
        targetName: recipientName,
        actorName,
        assignedAt,
      });
      tasks.push(sendEmail({ to: r.email, subject, html }));
    }

    await Promise.all(tasks);
  } catch (err) {
    console.error(
      "[mypage/members] §5.6.C/D proxy-assigned bundle failed",
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: §5.2.A 担当者招待 control broadcast
// 通常 staff 招待時のみ呼ばれる。組織の Owner + admin (操作者含む) 全員に
// 1 通ずつ送信し、失敗は console.error のみで握り潰す (Server Action 自体は成功)。
// ---------------------------------------------------------------------------
export async function sendMemberInvitedControl(params: {
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

    const invitedAt = formatDateTime(new Date().toISOString());

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
// Helper: §5.7 / §5.7.5 削除通知 (本人 + 組織管理層 broadcast)
//
// deleteMemberAction 成功後に呼ばれる共通 bundle:
//   - isProxy=true:  §5.7.A (残存有無で末尾分岐) + §5.7.B
//   - isProxy=false: §5.7.5.A + §5.7.5.B
//
// 失敗は console.error のみで握り潰す (DB 削除は完了済み、Server Action 自体は成功)。
// ---------------------------------------------------------------------------
export async function sendMemberRemoved(params: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  /** 削除実行前に取得した本人 email (applyDeletedSuffix 後は使えない) */
  targetEmail: string;
  /** 削除実行前に取得した本人姓名 */
  targetName: string;
  orgOwnerId: string;
  isProxy: boolean;
  /** §5.7.A 末尾分岐: true = 他組織で代理続行 / false = 全組織解除 (= globally_deleted=true) */
  hasRemainingMembership: boolean;
}): Promise<void> {
  const {
    admin,
    organizationId,
    actorUserId,
    targetUserId,
    targetEmail,
    targetName,
    orgOwnerId,
    isProxy,
    hasRemainingMembership,
  } = params;

  try {
    const [ownerProfileRes, actorRes, recipients] = await Promise.all([
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
      getOrganizationManagementRecipients(admin, organizationId, [targetUserId]),
    ]);

    const organizationName =
      ownerProfileRes.data?.display_name?.trim() || "ビジ友組織";
    const actorName =
      `${actorRes.data?.last_name ?? ""}${actorRes.data?.first_name ?? ""}`.trim() ||
      "管理者";
    const removedAt = formatDateTime(new Date().toISOString());

    const tasks: Promise<unknown>[] = [];

    // 本人宛 (§5.7.A or §5.7.5.A)
    if (targetEmail) {
      if (isProxy) {
        const { subject, html } = proxyRemovedEmail({
          recipientName: targetName,
          organizationName,
          actorName,
          removedAt,
          hasRemainingMembership,
        });
        tasks.push(sendEmail({ to: targetEmail, subject, html }));
      } else {
        const { subject, html } = staffRemovedEmail({
          recipientName: targetName,
          organizationName,
          actorName,
          removedAt,
        });
        tasks.push(sendEmail({ to: targetEmail, subject, html }));
      }
    }

    // 組織管理層 broadcast (§5.7.B or §5.7.5.B)
    for (const r of recipients) {
      if (isProxy) {
        const { subject, html } = proxyRemovedControlEmail({
          recipientName: r.displayName,
          targetName,
          actorName,
          removedAt,
        });
        tasks.push(sendEmail({ to: r.email, subject, html }));
      } else {
        const { subject, html } = staffRemovedControlEmail({
          recipientName: r.displayName,
          targetName,
          actorName,
          removedAt,
        });
        tasks.push(sendEmail({ to: r.email, subject, html }));
      }
    }

    await Promise.all(tasks);
  } catch (err) {
    console.error(
      "[deleteMemberAction] §5.7 / §5.7.5 member-removed broadcast failed",
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: §5.6.A + §5.6.B 権限変更通知 (本人 + 組織管理層 broadcast)
// updateMemberAction で org_role が変わった瞬間に呼ばれる。
// 本人宛 1 通 + 組織管理層 (本人除外) に 1 通ずつ Promise.all で並行送信。
// 失敗は console.error のみで握り潰す (Server Action 自体は成功)。
// ---------------------------------------------------------------------------
export async function sendMemberRoleChanged(params: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  oldRoleLabel: string;
  newRoleLabel: string;
}): Promise<void> {
  const {
    admin,
    organizationId,
    actorUserId,
    targetUserId,
    oldRoleLabel,
    newRoleLabel,
  } = params;

  try {
    const [targetRes, actorRes, recipients] = await Promise.all([
      admin
        .from("users")
        .select("email, last_name, first_name")
        .eq("id", targetUserId)
        .maybeSingle(),
      admin
        .from("users")
        .select("last_name, first_name")
        .eq("id", actorUserId)
        .maybeSingle(),
      getOrganizationManagementRecipients(admin, organizationId, [targetUserId]),
    ]);

    const targetEmail = targetRes.data?.email ?? "";
    const targetName =
      `${targetRes.data?.last_name ?? ""}${targetRes.data?.first_name ?? ""}`.trim() ||
      "ご担当者";
    const actorName =
      `${actorRes.data?.last_name ?? ""}${actorRes.data?.first_name ?? ""}`.trim() ||
      "管理者";
    const changedAt = formatDateTime(new Date().toISOString());

    const tasks: Promise<unknown>[] = [];

    // §5.6.A 本人宛
    if (targetEmail) {
      const { subject, html } = memberRoleChangedEmail({
        recipientName: targetName,
        oldRoleLabel,
        newRoleLabel,
        actorName,
        changedAt,
      });
      tasks.push(sendEmail({ to: targetEmail, subject, html }));
    }

    // §5.6.B 組織管理層 broadcast
    for (const r of recipients) {
      const { subject, html } = memberRoleChangedControlEmail({
        recipientName: r.displayName,
        targetName,
        oldRoleLabel,
        newRoleLabel,
        actorName,
        changedAt,
      });
      tasks.push(sendEmail({ to: r.email, subject, html }));
    }

    await Promise.all(tasks);
  } catch (err) {
    console.error(
      "[updateMemberAction] §5.6.A/B member-role-changed broadcast failed",
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
export async function sendEmailChangedByAdminControl(params: {
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

    const changedAt = formatDateTime(new Date().toISOString());

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
