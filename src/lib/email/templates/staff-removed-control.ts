import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface StaffRemovedControlEmailProps {
  /** 受信者 (Owner / admin の誰か) の表示名 */
  recipientName: string;
  /** 削除された通常 staff の姓名（スペースなし結合） */
  targetName: string;
  /** 削除操作者の姓名（スペースなし結合） */
  actorName: string;
  /** 削除日時 (YYYY/MM/DD HH:MM 形式) */
  removedAt: string;
}

/**
 * §5.7.5.B 通常担当者削除控え（法人 Owner + admin 宛）。
 *
 * 配信先: その組織内の Owner + admin（操作者本人含む、**削除された本人は除外**、
 * 他の staff は対象外）。`getOrganizationManagementRecipients(admin, orgId, [target])` を流用。
 *
 * §5.2.A 招待 control mail と並列構造、closing なし。
 * 代理 §5.7.B との区別: 「(ビジ友運営スタッフ)」サフィックスを **付けない**。
 */
export function staffRemovedControlEmail({
  recipientName,
  targetName,
  actorName,
  removedAt,
}: StaffRemovedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${targetName}さんを担当者から削除しました`,
    html: renderLayout({
      title: `${targetName}さんを担当者から削除しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の担当者削除が行われました。"),
        listItem("対象担当者", targetName),
        listItem("操作者", actorName),
        listItem("削除日時", removedAt, { last: true }),
      ].join(""),
    }),
  };
}
