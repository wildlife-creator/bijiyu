import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrganizationMemberRecipients } from "@/lib/email/recipients/organization-members";
import { sendEmail } from "@/lib/email/send-email";
import { messageNotificationEmail } from "@/lib/email/templates/message-notification";
import { resolveActorDisplayName } from "@/lib/utils/display-name";
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
  /** sendMessageAction で取得済の thread 行 (Phase 2: 新 org カラム含む) */
  thread: {
    participant_1_id: string;
    participant_2_id: string;
    /** Phase 2: participant_1 側の所属組織 (個人 identity なら null) */
    organization_1_id: string | null;
    /** Phase 2: participant_2 側の所属組織 (個人 identity なら null) */
    organization_2_id: string | null;
    /** 後方互換用の旧 organization_id (移行完了後 drop 予定) */
    organization_id?: string | null;
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
 * Phase 2 (A2 + A4 修正):
 *   受信者の role で方向判定していた旧設計を撤廃し、identity ベースに一般化する。
 *   これにより有料受注者 (role=client に昇格した受注者) 宛通知が壊れる A2 バグと、
 *   代理スタッフ送信メールの送信者名が本名になる A4 バグを同時に解消する。
 *
 * 送信方向 (identity ベース):
 *   - sender の側 (side 1 or side 2) を participant_id 一致で判定
 *   - receiver 側は反対側 (side 1 なら receiver=side 2 側、逆も同様)
 *   - receiver 側の organization_X_id が非 null → 組織 broadcast (M-03)
 *   - 個人 identity なら受信参加者 1 名に送信
 *
 * throttle クロックの意味論:
 *   スキーマは last_email_to_contractor_at / last_email_to_client_side_at の
 *   命名だが、Phase 2 では以下のように意味論を再定義する:
 *     - last_email_to_contractor_at   = side 2 (participant_2 側 mailbox) クロック
 *     - last_email_to_client_side_at  = side 1 (participant_1 側 mailbox) クロック
 *   旧慣例 (participant_2 = 受注者、side 1 = client 側) では意味論が一致し、
 *   新規 identity ベーススレッドでもクロックが独立に働く (同一側の連投を防ぐ)。
 *
 * 送信者名解決 (A4):
 *   - sender の側が organization を持つ → その組織 Owner の client_profiles.display_name
 *     (代理スタッフ本人の姓名を露出させない)
 *   - sender の側が個人 identity → 本人の client_profiles.display_name → users.company_name
 *     → 姓名 → "未設定" (resolveActorDisplayName の 4 段解決)
 */
export async function sendMessageNotification(
  admin: AdminClient,
  params: SendMessageNotificationParams,
): Promise<void> {
  const { threadId, thread, senderId, messageBody, hasImage } = params;

  // 1. sender がどちらの席にいるかを identity ベースで判定
  //    (participant 一致 → その席、それ以外 = 組織メンバーによる代理送信は
  //     sender の organization_members から解決)
  let senderOnSide2: boolean;
  if (thread.participant_1_id === senderId) {
    senderOnSide2 = false;
  } else if (thread.participant_2_id === senderId) {
    senderOnSide2 = true;
  } else {
    // sender が participant でない場合 = 送信元組織の他メンバー (Staff/Admin)
    // sender の active org を organization_1_id / organization_2_id と突き合わせる
    const { data: senderOrg } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", senderId)
      .maybeSingle();
    const senderOrgId = senderOrg?.organization_id ?? null;
    if (senderOrgId && senderOrgId === thread.organization_1_id) {
      senderOnSide2 = false;
    } else if (senderOrgId && senderOrgId === thread.organization_2_id) {
      senderOnSide2 = true;
    } else {
      // sender の帰属が判定できないケースは通知を諦める (安全側)
      return;
    }
  }

  // 2. receiver 側の identity 情報を抽出
  const receiverParticipantId = senderOnSide2
    ? thread.participant_1_id
    : thread.participant_2_id;
  const receiverOrgId = senderOnSide2
    ? thread.organization_1_id
    : thread.organization_2_id;
  const senderOrgIdResolved = senderOnSide2
    ? thread.organization_2_id
    : thread.organization_1_id;

  // 3. throttle クロック列 (side 1 → client_side、side 2 → contractor という semantic 再定義)
  const clockColumn:
    | "last_email_to_contractor_at"
    | "last_email_to_client_side_at" = senderOnSide2
    ? "last_email_to_client_side_at" // 受信側 = side 1
    : "last_email_to_contractor_at"; // 受信側 = side 2

  // 4. throttle 判定
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

  // 5. 受信者リスト解決
  let recipients: Array<{ email: string; recipientName: string }> = [];
  if (receiverOrgId) {
    // 受信側 = 組織 identity → 組織メンバー全員 broadcast (M-03)
    const orgRecipients = await getOrganizationMemberRecipients(
      admin,
      receiverOrgId,
    );
    recipients = orgRecipients.map((r) => ({
      email: r.email,
      recipientName: r.displayName,
    }));
  } else {
    // 受信側 = 個人 identity → 受信参加者 1 名
    const { data: receiverUser } = await admin
      .from("users")
      .select(
        "email, last_name, first_name, company_name, deleted_at, client_profiles(display_name)",
      )
      .eq("id", receiverParticipantId)
      .maybeSingle();
    if (receiverUser?.email && !receiverUser.deleted_at) {
      const profile = Array.isArray(receiverUser.client_profiles)
        ? receiverUser.client_profiles[0]
        : receiverUser.client_profiles;
      recipients = [
        {
          email: receiverUser.email,
          recipientName: resolveActorDisplayName({
            displayName: profile?.display_name ?? null,
            companyName: receiverUser.company_name,
            lastName: receiverUser.last_name,
            firstName: receiverUser.first_name,
            deletedAt: receiverUser.deleted_at,
          }),
        },
      ];
    }
  }

  if (recipients.length === 0) return;

  // 6. 送信者名解決 (A4 修正)
  //    sender 側が organization → その組織 Owner の client_profiles.display_name
  //    sender 側が個人 identity → 本人の client_profiles → company_name → 姓名
  let senderName: string;
  if (senderOrgIdResolved) {
    const { data: orgRow } = await admin
      .from("organizations")
      .select(
        `owner_user:users!owner_id(
           last_name, first_name, deleted_at,
           client_profiles(display_name)
         )`,
      )
      .eq("id", senderOrgIdResolved)
      .maybeSingle();
    const owner = orgRow?.owner_user
      ? Array.isArray(orgRow.owner_user)
        ? orgRow.owner_user[0]
        : orgRow.owner_user
      : null;
    const profile = owner?.client_profiles
      ? Array.isArray(owner.client_profiles)
        ? owner.client_profiles[0]
        : owner.client_profiles
      : null;
    senderName = resolveActorDisplayName({
      displayName: profile?.display_name ?? null,
      companyName: null,
      lastName: owner?.last_name ?? null,
      firstName: owner?.first_name ?? null,
      deletedAt: owner?.deleted_at ?? null,
    });
  } else {
    const { data: senderUser } = await admin
      .from("users")
      .select(
        "last_name, first_name, company_name, deleted_at, client_profiles(display_name)",
      )
      .eq("id", senderId)
      .maybeSingle();
    const profile = senderUser?.client_profiles
      ? Array.isArray(senderUser.client_profiles)
        ? senderUser.client_profiles[0]
        : senderUser.client_profiles
      : null;
    senderName = resolveActorDisplayName({
      displayName: profile?.display_name ?? null,
      companyName: senderUser?.company_name,
      lastName: senderUser?.last_name,
      firstName: senderUser?.first_name,
      deletedAt: senderUser?.deleted_at,
    });
  }

  // 7. 送信 (画像のみメッセージは body 空欄になるのでプレースホルダー差し込み)
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

  // 8. クロック更新 (送信後、throttle 起算点を now() に)
  await admin
    .from("message_threads")
    .update({ [clockColumn]: new Date().toISOString() })
    .eq("id", threadId);
}
