import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ProxyAssignedControlEmailProps {
  /** 受信者 (Owner / admin の誰か) の表示名 */
  recipientName: string;
  /** 代理設定された ビジ友運営スタッフの姓名（スペースなし結合） */
  targetName: string;
  /** 設定操作者の姓名（スペースなし結合） */
  actorName: string;
  /** 設定日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  assignedAt: string;
}

/**
 * §5.6.D 代理アカウント設定通知（法人 Owner + admin 宛、3 ケース統合）。
 *
 * 配信先: その組織内の Owner + admin（操作者本人含む、**設定された本人 = ビジ友運営スタッフは
 * 除外**、staff は対象外）。`getOrganizationManagementRecipients(admin, orgId, [本人ID])` を流用。
 *
 * 発火 (3 ケース統合):
 *   1. `createMemberAction` 新規招待 + isProxyAccount=true (このとき本人宛は §5.1-Proxy が単独でカバー)
 *   2. `updateMemberAction` で is_proxy_account: false → true
 *   3. `createMemberAction` reuse パス (既存代理が別組織に追加された瞬間)
 *
 * 「【ビジ友】」プレフィックス（受信者は法人側）。「一部」を残し全代行ではないことを明示
 * （§5.7.B 解除控えとの非対称な設計）。
 */
export function proxyAssignedControlEmail({
  recipientName,
  targetName,
  actorName,
  assignedAt,
}: ProxyAssignedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${targetName}さんを代理アカウントとして設定しました`,
    html: renderLayout({
      title: `${targetName}さんを代理アカウントとして設定しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の代理アカウント設定が行われました。"),
        listItem("代理アカウント担当者", `${targetName} (ビジ友運営スタッフ)`),
        listItem("操作者", actorName),
        listItem("設定日時", assignedAt, { blockEnd: true }),
        paragraph(
          "代理アカウントとは、ビジ友運営が貴社の操作の一部を代行する設定です。",
        ),
        paragraph(
          "代理として送信したメッセージには、発注者側の画面でのみ「代理」マークが付きます。受注者側には表示されません。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
