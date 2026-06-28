import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ScoutDeclinedControlEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 辞退した受注者の表示名 (`getUserDisplayName(prefer-company)` で屋号優先) */
  contractorName: string;
  /** スカウト送信日 (YYYY/MM/DD) */
  scoutSentDate: string;
  /** 辞退日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  declinedAt: string;
}

/**
 * §1.3.A スカウト辞退通知（発注者組織宛 broadcast）。
 *
 * `respondToScoutAction(response="rejected")` で発火。
 * 個人プラン: スカウト送信者本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 *
 * 受注者本人控え (§1.3.B) は送らない (M-02 例外、軽操作のためノイズ化回避)。
 * 「要対応」は付けない (軽いネガティブ事象、緊急性なし)。
 * 職種・エリア・辞退理由・スカウトメッセージ抜粋は spec 上含めない。
 */
export function scoutDeclinedControlEmail({
  recipientName,
  jobTitle,
  contractorName,
  scoutSentDate,
  declinedAt,
}: ScoutDeclinedControlEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】${contractorName}さんからスカウトを辞退されました`,
    html: renderLayout({
      title: `${contractorName}さんからスカウトを辞退されました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記のスカウトが辞退されました。"),
        listItem("案件名", jobTitle),
        listItem("辞退した受注者", contractorName),
        listItem("スカウト送信日", scoutSentDate),
        listItem("辞退日時", declinedAt, { blockEnd: true }),
        paragraph("他の受注者へのご検討をお願いいたします。", { last: true }),
      ].join(""),
    }),
  };
}
