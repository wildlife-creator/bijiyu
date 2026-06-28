import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface MemberRoleChangedEmailProps {
  /** 受信者 = 権限変更された本人の表示名（姓 + 名 スペースなし結合） */
  recipientName: string;
  /** 変更前の権限ラベル（「管理者」 or 「担当者」） */
  oldRoleLabel: string;
  /** 変更後の権限ラベル */
  newRoleLabel: string;
  /** 変更操作者の表示名（姓 + 名 スペースなし結合） */
  actorName: string;
  /** 変更日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  changedAt: string;
}

/**
 * §5.6.A 権限変更通知（本人宛）。
 *
 * 発火: `updateMemberAction` で `org_role` が変わった時 (`existingRole !== newRole`)。
 * 配信先: 変更対象本人 1 名。closing は §5.4.A / §5.7.A と同じ「セキュリティ通知の業務動作明示」型
 * （身に覚えがない場合 → お問い合わせ窓口テキストリンク）。
 */
export function memberRoleChangedEmail({
  recipientName,
  oldRoleLabel,
  newRoleLabel,
  actorName,
  changedAt,
}: MemberRoleChangedEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: "【ビジ友】あなたの権限が変更されました",
    html: renderLayout({
      title: "あなたの権限が変更されました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("あなたの組織内での権限が変更されました。"),
        listItem("変更前の権限", oldRoleLabel),
        listItem("変更後の権限", newRoleLabel),
        listItem("変更操作者", actorName),
        listItem("変更日時", changedAt, { blockEnd: true }),
        paragraph("身に覚えがない場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
