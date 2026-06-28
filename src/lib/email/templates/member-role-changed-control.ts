import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface MemberRoleChangedControlEmailProps {
  /** 受信者 (Owner / admin の誰か) の表示名 */
  recipientName: string;
  /** 権限変更された対象担当者の姓名（スペースなし結合） */
  targetName: string;
  /** 変更前の権限ラベル */
  oldRoleLabel: string;
  /** 変更後の権限ラベル */
  newRoleLabel: string;
  /** 変更操作者の姓名（スペースなし結合） */
  actorName: string;
  /** 変更日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  changedAt: string;
}

/**
 * §5.6.B 権限変更通知（組織管理層宛）。
 *
 * 配信先: その組織内の Owner + admin（操作者本人含む、**変更対象本人は除外**、staff は対象外）。
 * `getOrganizationManagementRecipients(admin, organizationId, [targetUserId])` を流用。
 *
 * closing なし（§5.2.A / §5.4.B と一貫、事実通知のみ）。
 * 「組織管理操作の控え通知」原則の三例目（§5.2.A / §5.4.B に続く）。
 */
export function memberRoleChangedControlEmail({
  recipientName,
  targetName,
  oldRoleLabel,
  newRoleLabel,
  actorName,
  changedAt,
}: MemberRoleChangedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${targetName}さんの権限を変更しました`,
    html: renderLayout({
      title: `${targetName}さんの権限を変更しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の権限変更が行われました。"),
        listItem("対象担当者", targetName),
        listItem("変更前の権限", oldRoleLabel),
        listItem("変更後の権限", newRoleLabel),
        listItem("操作者", actorName),
        listItem("変更日時", changedAt, { last: true }),
      ].join(""),
    }),
  };
}
