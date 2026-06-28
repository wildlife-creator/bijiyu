import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ProxyRemovedControlEmailProps {
  /** 受信者 (Owner / admin の誰か) の表示名 */
  recipientName: string;
  /** 削除された ビジ友運営スタッフの姓名（スペースなし結合） */
  targetName: string;
  /** 削除操作者の姓名（スペースなし結合） */
  actorName: string;
  /** 解除日時 (YYYY/MM/DD HH:MM 形式) */
  removedAt: string;
}

/**
 * §5.7.B 代理アカウント解除控え（法人 Owner + admin 宛）。
 *
 * 配信先: その組織内の Owner + admin（操作者本人含む、**削除された本人 = ビジ友運営スタッフは
 * 除外**、staff は対象外）。`getOrganizationManagementRecipients(admin, orgId, [target])` を流用。
 *
 * 件名は §5.7.A「解除されました（受動）」と対をなす「解除しました（能動）」表現。
 *
 * closing で「一部」を **削除して断言**: §5.6.D 設定通知では「操作の一部を代行する」と限定明示する
 * のに対し、解除段階では「貴社の操作を代行することはなくなります」と断言する。設定時の限定明示と
 * 解除時の断言を非対称にする日本語的にも業務的にも自然な対比（spec §5.7.B「一部をあえて削除した理由」参照）。
 */
export function proxyRemovedControlEmail({
  recipientName,
  targetName,
  actorName,
  removedAt,
}: ProxyRemovedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${targetName}さんの代理アカウント設定を解除しました`,
    html: renderLayout({
      title: `${targetName}さんの代理アカウント設定を解除しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の代理アカウント設定が解除されました。"),
        listItem("対象担当者", `${targetName} (ビジ友運営スタッフ)`),
        listItem("操作者", actorName),
        listItem("解除日時", removedAt, { blockEnd: true }),
        paragraph(
          "今後、ビジ友運営が貴社の操作を代行することはなくなります。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
