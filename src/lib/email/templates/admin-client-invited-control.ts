import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface AdminClientInvitedControlEmailProps {
  /** 受信者 (操作した ビジ友運営 admin 本人) の表示名 */
  recipientName: string;
  /** 招待された発注者担当の姓名（スペースなし結合） */
  memberName: string;
  /** 招待された会社名（ADM-007「発注者名」欄入力値） */
  companyName: string;
  /** 招待された担当者のメールアドレス */
  memberEmail: string;
  /** 招待日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  invitedAt: string;
}

/**
 * §5.2.B 発注者招待の ビジ友運営 admin 本人宛 control mail。
 *
 * 配信先: `createClientInviteAction` を実行した admin 本人 1 名のみ
 * （`OPS_NOTIFICATION_EMAIL` には送らない、日常の発注者招待は重要度信号として
 * 別カテゴリ）。
 *
 * 発火: `createClientInviteAction` 成功 (writeAuditLog 後、redirect 前)。
 *
 * 件名先頭の「【ビジ友 運営】」プレフィックスは M-07 適用。recipient = ビジ友
 * 運営 admin の個人 inbox での識別容易化目的。
 *
 * closing なし（§5.2.A と一貫、事実通知のみ）。
 */
export function adminClientInvitedControlEmail({
  recipientName,
  memberName,
  companyName,
  memberEmail,
  invitedAt,
}: AdminClientInvitedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友 運営】${memberName} 様（${companyName}）を発注者として招待しました`,
    html: renderLayout({
      title: `${memberName} 様（${companyName}）を発注者として招待しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の発注者を招待しました。"),
        listItem("担当者氏名", memberName),
        listItem("会社名", companyName),
        listItem("メールアドレス", memberEmail),
        listItem("招待日時", invitedAt, { last: true }),
      ].join(""),
    }),
  };
}
