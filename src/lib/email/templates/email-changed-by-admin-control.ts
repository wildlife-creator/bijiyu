import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface EmailChangedByAdminControlEmailProps {
  /** 受信者 (Owner / admin の誰か) の表示名 */
  recipientName: string;
  /** メールアドレスが変更された対象担当者の姓名（スペースなし結合） */
  targetName: string;
  /** 変更前のメールアドレス */
  oldEmail: string;
  /** 変更後のメールアドレス */
  newEmail: string;
  /** 変更操作者の姓名（スペースなし結合） */
  actorName: string;
  /** 変更日時（YYYY/MM/DD HH:MM 形式、呼出側で整形） */
  changedAt: string;
}

/**
 * §5.4.B 管理者によるメール強制変更の組織管理層宛 control mail。
 *
 * 配信先: 対象組織の Owner + admin (操作者本人含む)、ただし変更対象スタッフ本人は
 * 除外（§5.4.A で本人宛通知を別途受信済みのため重複防止）。
 *
 * 発火: `updateMemberAction` パターン B (admin client での強制 email 変更)
 * 成功時、§5.4.A 旧+新 送信ループの **後**。
 *
 * closing なし（§5.2.A / §5.2.B 招待 control と一貫、事実通知のみ）。
 * 「組織管理操作の控え通知」原則の二例目（§5.2.A 招待 control の延長）。
 */
export function emailChangedByAdminControlEmail({
  recipientName,
  targetName,
  oldEmail,
  newEmail,
  actorName,
  changedAt,
}: EmailChangedByAdminControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${targetName}さんのメールアドレスを変更しました`,
    html: renderLayout({
      title: `${targetName}さんのメールアドレスを変更しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記のメールアドレス変更が行われました。"),
        listItem("対象担当者", targetName),
        listItem("旧メールアドレス", oldEmail),
        listItem("新メールアドレス", newEmail),
        listItem("操作者", actorName),
        listItem("変更日時", changedAt, { last: true }),
      ].join(""),
    }),
  };
}
