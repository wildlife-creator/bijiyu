import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface MemberInvitedControlEmailProps {
  /** 受信者 (Owner / admin の誰か) の表示名 */
  recipientName: string;
  /** 招待された担当者の姓名（スペースなし結合） */
  memberName: string;
  /** 招待された担当者のメールアドレス */
  memberEmail: string;
  /** 権限の日本語ラベル（「管理者」 or 「担当者」） */
  roleLabel: string;
  /** 代理アカウントの日本語ラベル（「はい」 or 「いいえ」） */
  isProxyLabel: string;
  /** 招待操作者の姓名（スペースなし結合） */
  actorName: string;
  /** 招待日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  invitedAt: string;
}

/**
 * §5.2.A 担当者招待の組織管理層宛 control mail（通常 staff 招待専用）。
 *
 * 配信先: 対象組織の Owner + admin (操作者本人を含む)。M-03 broadcast の例外運用で
 * staff は対象外（spec §5.2.A B-1）。
 *
 * 発火: `createMemberAction` 成功 + 通常 staff 招待 (isProxyAccount=false かつ
 * 非 reuse パス) のときのみ。代理 / reuse パスは §5.6.D 代理設定控えに委譲。
 *
 * closing なし（§1.6.C 発注確定控えと同パターン、事実通知のみ）。
 */
export function memberInvitedControlEmail({
  recipientName,
  memberName,
  memberEmail,
  roleLabel,
  isProxyLabel,
  actorName,
  invitedAt,
}: MemberInvitedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${memberName}さんをメンバーとして招待しました`,
    html: renderLayout({
      title: `${memberName}さんをメンバーとして招待しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記のメンバーを招待しました。"),
        listItem("担当者氏名", memberName),
        listItem("メールアドレス", memberEmail),
        listItem("権限", roleLabel),
        listItem("代理アカウント", isProxyLabel),
        listItem("招待操作者", actorName),
        listItem("招待日時", invitedAt, { last: true }),
      ].join(""),
    }),
  };
}
