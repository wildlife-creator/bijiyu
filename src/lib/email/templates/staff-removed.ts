import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface StaffRemovedEmailProps {
  /** 受信者 (削除された本人) の表示名 */
  recipientName: string;
  /** 削除対象組織の Owner の client_profiles.display_name */
  organizationName: string;
  /** 削除操作者の表示名 */
  actorName: string;
  /** 削除日時 (YYYY/MM/DD HH:MM 形式) */
  removedAt: string;
}

/**
 * §5.7.5.A 通常担当者削除通知（本人宛）。
 *
 * 発火: `deleteMemberAction` で通常 staff (`is_proxy_account=false`) の
 * `organization_members` 行が物理削除された時。
 *
 * 通常 staff は 1 組織のみ在籍可能なので削除 = 即退会扱い (`delete_staff_member` v2 が
 * `users.deleted_at` をセット) で確定。代理 staff の N 法人兼任モデル (§5.7.A) と違い、
 * 残存有無の分岐は不要 (= 必ず「ビジ友のご利用は終了」)。
 *
 * closing で「これに伴い、ビジ友のご利用は終了いたしました」を残す + セキュリティ通知の
 * お問い合わせ窓口テキストリンク (§5.4.A / §5.6.A / §5.7.A と同パターン)。
 * 「再登録は新たに会員登録〜」は同 email 再招待ブロック問題のため削除済 (spec §5.7.5 確定)。
 */
export function staffRemovedEmail({
  recipientName,
  organizationName,
  actorName,
  removedAt,
}: StaffRemovedEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: `【ビジ友】「${organizationName}」の組織から削除されました`,
    html: renderLayout({
      title: `${organizationName} の組織から削除されました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の組織の担当者から削除されました。"),
        listItem("法人名", organizationName),
        listItem("削除操作者", actorName),
        listItem("削除日時", removedAt, { blockEnd: true }),
        paragraph("これに伴い、ビジ友のご利用は終了いたしました。"),
        paragraph("身に覚えがない場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
