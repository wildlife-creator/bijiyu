import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrganizationMemberRecipients } from "@/lib/email/recipients/organization-members";
import { sendEmail } from "@/lib/email/send-email";
import { messageNotificationEmail } from "@/lib/email/templates/message-notification";
import {
  getUserDisplayName,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

/**
 * §2.1 通常メッセージ受信通知メールの throttle 窓 (15 分)。
 * spec WIP §2.1「連投スパム防止と急ぎ対応のバランス」確定値。
 */
export const MESSAGE_EMAIL_THROTTLE_MS = 15 * 60 * 1000;

interface SendMessageNotificationParams {
  /** 対象スレッド ID */
  threadId: string;
  /** sendMessageAction で取得済の thread 行 */
  thread: {
    participant_1_id: string;
    participant_2_id: string;
    organization_id: string | null;
  };
  /** メッセージ送信者 user.id */
  senderId: string;
  /** メッセージ本文 (trim 済を想定。画像のみの場合は空文字) */
  messageBody: string;
  /** 画像添付の有無 (本文が空のとき「(画像が添付されています)」プレースホルダー差し込みに使う) */
  hasImage: boolean;
}

/**
 * §2.1 通常メッセージ受信通知 (throttle 15 分 + M-03 broadcast)。
 *
 * 呼び出し前提: `sendMessageAction` の末尾で fire-and-forget。失敗は呼び出し側で
 * `.catch(console.error)` する。本関数自体は throw しない (各 sendEmail も catch 済)。
 *
 * 仕様 (spec WIP §2.1 確定形):
 * - 即時送信 + (スレッド × 受信側) で 15 分間隔ガード (`MESSAGE_EMAIL_THROTTLE_MS`)
 * - 1 通目は必ず送る。15 分以内の追加メッセージは送信 skip
 * - 15 分経過後の次のメッセージで再送 (= クロックは送信成功時のみ now() に更新)
 *
 * 配信先 (受信側 = 「自分以外の participant」のロールで判定):
 * - 受信者 role='contractor': 受注者本人 1 名 → クロック `last_email_to_contractor_at`
 * - 受信者 role!='contractor' + thread.organization_id NOT NULL:
 *     法人 client → 組織メンバー全員 broadcast (M-03)
 *     → クロック `last_email_to_client_side_at`
 * - 受信者 role!='contractor' + thread.organization_id NULL:
 *     個人発注者 → オーナー本人 1 名
 *     → クロック `last_email_to_client_side_at`
 *
 * 送信者名解決:
 * - 受信者 contractor (= 送信者 client side): `resolveParticipantName`
 *   (client_profiles.display_name 優先)
 * - 受信者 client side (= 送信者 contractor): `getUserDisplayName(prefer-company)`
 *   (屋号優先、姓名フォールバック)
 *
 * 除外:
 * - スカウト初回は `sendScoutAction` が `scoutNotificationEmail` (§1.7.A) で
 *   通知済。本 Action 経由のメッセージは常に `is_scout=false` で insert されるため
 *   除外条件は不要。
 */
export async function sendMessageNotification(
  admin: AdminClient,
  params: SendMessageNotificationParams,
): Promise<void> {
  const { threadId, thread, senderId, messageBody, hasImage } = params;

  // 1. 受信参加者 ID を特定 (senderId が p1 なら受信 = p2、その逆)
  const receiverParticipantId =
    thread.participant_1_id === senderId
      ? thread.participant_2_id
      : thread.participant_1_id;

  // 2. 受信参加者のロールで送信方向を判定
  const { data: receiverRoleRow } = await admin
    .from("users")
    .select("role")
    .eq("id", receiverParticipantId)
    .maybeSingle();

  if (!receiverRoleRow) return;

  const direction: "to_contractor" | "to_client_side" =
    receiverRoleRow.role === "contractor" ? "to_contractor" : "to_client_side";
  const clockColumn:
    | "last_email_to_contractor_at"
    | "last_email_to_client_side_at" =
    direction === "to_contractor"
      ? "last_email_to_contractor_at"
      : "last_email_to_client_side_at";

  // 3. throttle 判定 (受信側のクロックが 15 分以内なら skip)
  const { data: clockRow } = await admin
    .from("message_threads")
    .select(clockColumn)
    .eq("id", threadId)
    .maybeSingle();

  const lastSent = (
    clockRow as Record<string, string | null> | null
  )?.[clockColumn];
  if (lastSent) {
    const elapsedMs = Date.now() - new Date(lastSent).getTime();
    if (elapsedMs < MESSAGE_EMAIL_THROTTLE_MS) return;
  }

  // 4. 配信先解決
  let recipients: Array<{ email: string; recipientName: string }> = [];
  if (direction === "to_contractor") {
    const { data: contractor } = await admin
      .from("users")
      .select("email, last_name, first_name, deleted_at")
      .eq("id", receiverParticipantId)
      .maybeSingle();
    if (contractor?.email && !contractor.deleted_at) {
      recipients = [
        {
          email: contractor.email,
          recipientName: resolveParticipantName({
            displayName: null,
            lastName: contractor.last_name,
            firstName: contractor.first_name,
            deletedAt: contractor.deleted_at,
          }),
        },
      ];
    }
  } else if (thread.organization_id) {
    // 法人 client side → 組織メンバー全員 broadcast (M-03)
    const orgRecipients = await getOrganizationMemberRecipients(
      admin,
      thread.organization_id,
    );
    recipients = orgRecipients.map((r) => ({
      email: r.email,
      recipientName: r.displayName,
    }));
  } else {
    // 個人発注者 → 本人 1 名 (client_profiles.display_name 優先)
    const { data: clientUser } = await admin
      .from("users")
      .select(
        "email, last_name, first_name, deleted_at, client_profiles(display_name)",
      )
      .eq("id", receiverParticipantId)
      .maybeSingle();
    if (clientUser?.email && !clientUser.deleted_at) {
      const profile = Array.isArray(clientUser.client_profiles)
        ? clientUser.client_profiles[0]
        : clientUser.client_profiles;
      recipients = [
        {
          email: clientUser.email,
          recipientName: resolveParticipantName({
            displayName: profile?.display_name ?? null,
            lastName: clientUser.last_name,
            firstName: clientUser.first_name,
            deletedAt: clientUser.deleted_at,
          }),
        },
      ];
    }
  }

  if (recipients.length === 0) return;

  // 5. 送信者名解決
  let senderName: string;
  if (direction === "to_contractor") {
    // sender = client side → display_name 優先
    const { data: senderUser } = await admin
      .from("users")
      .select(
        "last_name, first_name, deleted_at, client_profiles(display_name)",
      )
      .eq("id", senderId)
      .maybeSingle();
    const profile = senderUser
      ? Array.isArray(senderUser.client_profiles)
        ? senderUser.client_profiles[0]
        : senderUser.client_profiles
      : null;
    senderName = resolveParticipantName({
      displayName: profile?.display_name ?? null,
      lastName: senderUser?.last_name,
      firstName: senderUser?.first_name,
      deletedAt: senderUser?.deleted_at,
    });
  } else {
    // sender = contractor → 屋号優先 (`prefer-company`)
    const { data: senderUser } = await admin
      .from("users")
      .select("last_name, first_name, company_name, deleted_at")
      .eq("id", senderId)
      .maybeSingle();
    senderName = senderUser
      ? getUserDisplayName(
          {
            lastName: senderUser.last_name,
            firstName: senderUser.first_name,
            companyName: senderUser.company_name,
            deletedAt: senderUser.deleted_at,
          },
          "prefer-company",
        )
      : "受注者";
  }

  // 6. 送信 (画像のみメッセージは body 空欄になるのでプレースホルダー差し込み)
  const messagePreview =
    messageBody.trim() || (hasImage ? "(画像が添付されています)" : "");

  await Promise.all(
    recipients.map((r) => {
      const { subject, html } = messageNotificationEmail({
        recipientName: r.recipientName,
        senderName,
        messagePreview,
      });
      return sendEmail({ to: r.email, subject, html }).catch((err) => {
        console.error(
          "[sendMessageNotification] sendEmail failed:",
          err,
          r.email,
        );
      });
    }),
  );

  // 7. クロック更新 (送信後、throttle 起算点を now() に)
  await admin
    .from("message_threads")
    .update({ [clockColumn]: new Date().toISOString() })
    .eq("id", threadId);
}
