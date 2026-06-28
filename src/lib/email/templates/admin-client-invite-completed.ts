import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface AdminClientInviteCompletedEmailProps {
  /** 受信者 (操作した ビジ友運営 admin) の表示名 */
  recipientName: string;
  /** アカウント設定を完了した担当者の姓名（スペースなし結合） */
  memberName: string;
  /** 招待時の会社名（ADM-007 入力値） */
  companyName: string;
  /** アカウント設定を完了した担当者のメールアドレス */
  memberEmail: string;
  /** 承諾日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  acceptedAt: string;
}

/**
 * §5.3.B 発注者招待 アカウント設定完了通知（ビジ友運営 admin 本人宛、Resend、新規）。
 *
 * `acceptInviteAction` の Client 招待パス（`invited_company_name` 分岐）で
 * パスワード設定が完了した際に発火。配信先は §5.2.B と同じく audit_logs 逆引きで
 * 解決した「招待操作した admin 本人」1 名のみ。
 *
 * 件名先頭の「【ビジ友 運営】」プレフィックスは M-07 適用。
 *
 * closing は「状態説明」（§4.1 申請受理控えと同分類）。次のフェーズ = 課金待ち
 * を業務動作で説明することで admin の能動的画面巡回を不要にする。
 */
export function adminClientInviteCompletedEmail({
  recipientName,
  memberName,
  companyName,
  memberEmail,
  acceptedAt,
}: AdminClientInviteCompletedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友 運営】${memberName} 様（${companyName}）がアカウント設定を完了しました`,
    html: renderLayout({
      title: `${memberName} 様（${companyName}）がアカウント設定を完了しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の発注者がアカウント設定を完了しました。"),
        listItem("担当者氏名", memberName),
        listItem("会社名", companyName),
        listItem("メールアドレス", memberEmail),
        listItem("承諾日時", acceptedAt, { blockEnd: true }),
        paragraph(
          "現在、ご契約のお申し込みにお進みいただいています。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
