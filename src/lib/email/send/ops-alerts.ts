import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/send-email";
import { orphanAuthUserAlertEmail } from "@/lib/email/templates/orphan-auth-user-alert";
import { emailRecycleFailureAlertEmail } from "@/lib/email/templates/email-recycle-failure-alert";
import type { Database } from "@/types/database";
import { formatDateTime } from "@/lib/utils/format-date";

/**
 * apply-deleted-suffix.ts の `AdminClient` 型と同等。
 * 循環インポート防止のためここで再定義 (apply-deleted-suffix が ops-alerts を fire-and-forget
 * で呼ぶため、型を共有元から import すると循環する)。
 */
type AdminClient = SupabaseClient<Database>;

/**
 * §9 系 OPS 通知 (運営宛アラート) の集約モジュール。
 *
 * 「dev エスカレーション必須型」OPS 通知の送信ヘルパーを 1 ファイルに集約。
 * 各ヘルパーは `OPS_NOTIFICATION_EMAIL` の有無で skip 判定し、送信失敗は
 * `console.error` のみで握り潰す (業務継続性優先、呼び出し元はメール失敗で巻き戻さない)。
 */

// ---------------------------------------------------------------------------
// §9.1 担当者追加が途中で失敗した時のアラート (既存 E-13 改修)
// ---------------------------------------------------------------------------

interface SendOrphanAuthUserAlertParams {
  /** 招待先メールアドレス (フォーム入力値) */
  invitedEmail: string;
  /** 操作対象の組織 ID (組織名解決に使用) */
  organizationId: string;
}

/**
 * §9.1 アラート送信。`createMemberAction` の cleanup 失敗ブロックから呼ぶ。
 *
 * 組織名は `organizations.owner_id → client_profiles.display_name` で解決。
 * 解決失敗時は `organization_id` (UUID) を fallback として本文に出力。
 */
export async function sendOrphanAuthUserAlert(
  admin: AdminClient,
  params: SendOrphanAuthUserAlertParams,
): Promise<void> {
  const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
  if (!opsEmail) {
    console.warn(
      "[ops-alerts] OPS_NOTIFICATION_EMAIL not set — skipping orphan-auth-user alert",
    );
    return;
  }

  try {
    const organizationName = await resolveOrganizationDisplayName(
      admin,
      params.organizationId,
    );

    const { subject, html } = orphanAuthUserAlertEmail({
      occurredAt: formatDateTime(new Date().toISOString()),
      organizationName: organizationName ?? params.organizationId,
      invitedEmail: params.invitedEmail,
    });

    await sendEmail({ to: opsEmail, subject, html });
  } catch (err) {
    console.error("[ops-alerts] sendOrphanAuthUserAlert failed", err);
  }
}

// ---------------------------------------------------------------------------
// §9.2 使用済みメールアドレスの片付けが失敗した時のアラート (新規)
// ---------------------------------------------------------------------------

/** `apply-deleted-suffix.ts` の path 値 → 日本語ラベル変換マップ。 */
const TRIGGER_LABELS: Record<string, string> = {
  self_withdrawal: "退会",
  admin_force_delete: "管理者による強制削除",
  staff_delete: "担当者の削除",
  subscription_deleted: "サブスクリプション解約",
};

interface SendEmailRecycleFailureAlertParams {
  /** `applyDeletedSuffix` の `options.path` 値 */
  path: string;
  /** 対象 user.id (氏名解決に使用、`auth.users.id` と同値の前提) */
  targetUserId: string;
  /** 印付け前の元 email (取得できなかった場合は null) */
  targetEmail: string | null;
  /**
   * 法人組織コンテキスト ID (任意、null なら【対象組織】行を省略)。
   *
   * 呼び出しコンテキスト別の解決ガイド:
   *   - 退会 (executeWithdrawal): Owner なら `orgMembership.organization_id`、それ以外は null
   *   - admin 強制削除 (executeWithdrawal): 同上 (admin 経由でも Owner 退会なら組織あり)
   *   - 担当者削除 (deleteMemberAction): `actor.organizationId`
   *   - subscription_deleted: null
   */
  organizationId?: string | null;
}

/**
 * §9.2 アラート送信。`applyDeletedSuffix` の失敗 / skip パスから fire-and-forget で呼ぶ。
 *
 * 呼ばないケース: `already_suffixed` no-op (問題ではない)。
 *
 * 内部処理:
 * 1. `public.users` から `last_name + first_name` を取得 (失敗 = 「(氏名未設定)」)
 * 2. `organizationId` が渡されたら組織名を解決 (失敗 = null = 行省略)
 * 3. `triggerLabel` を path から日本語変換 (未定義値は「その他」)
 * 4. `sendEmail` で OPS_NOTIFICATION_EMAIL 宛に送信
 */
export async function sendEmailRecycleFailureAlert(
  admin: AdminClient,
  params: SendEmailRecycleFailureAlertParams,
): Promise<void> {
  const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
  if (!opsEmail) {
    console.warn(
      "[ops-alerts] OPS_NOTIFICATION_EMAIL not set — skipping email-recycle-failure alert",
    );
    return;
  }

  try {
    const triggerLabel = TRIGGER_LABELS[params.path] ?? "その他";

    const { data: userRow } = await admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", params.targetUserId)
      .maybeSingle();

    const lastName = (userRow?.last_name ?? "").trim();
    const firstName = (userRow?.first_name ?? "").trim();
    const targetDisplayName =
      `${lastName}${firstName}`.trim() || "(氏名未設定)";

    const organizationName = params.organizationId
      ? ((await resolveOrganizationDisplayName(admin, params.organizationId)) ??
        params.organizationId)
      : null;

    const { subject, html } = emailRecycleFailureAlertEmail({
      occurredAt: formatDateTime(new Date().toISOString()),
      triggerLabel,
      targetEmail: params.targetEmail ?? "(取得不可)",
      targetDisplayName,
      organizationName,
    });

    await sendEmail({ to: opsEmail, subject, html });
  } catch (err) {
    console.error("[ops-alerts] sendEmailRecycleFailureAlert failed", err);
  }
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * organizations.owner_id → client_profiles.display_name で解決。
 * organizations が見つからない / display_name が空ならば null を返す。
 */
async function resolveOrganizationDisplayName(
  admin: AdminClient,
  organizationId: string,
): Promise<string | null> {
  const { data: org } = await admin
    .from("organizations")
    .select("owner_id")
    .eq("id", organizationId)
    .maybeSingle();
  const ownerId = org?.owner_id as string | undefined;
  if (!ownerId) return null;

  const { data: profile } = await admin
    .from("client_profiles")
    .select("display_name")
    .eq("user_id", ownerId)
    .maybeSingle();
  const displayName = profile?.display_name?.trim();
  return displayName || null;
}
