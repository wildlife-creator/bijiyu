import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface OrderAcceptedControlEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 受注者の表示名 (`getUserDisplayName(prefer-company)` で屋号優先) */
  contractorName: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 応募人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 初回稼働日 (YYYY/MM/DD) */
  firstWorkDate: string;
  /** 工期終了日 (YYYY/MM/DD)。NULL なら省略 */
  workEndDate?: string;
  /** 発注確定日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  decidedAt: string;
}

/**
 * §1.6.C 発注確定控え (発注者組織宛 broadcast)。
 *
 * `acceptApplicationAction` で applied → accepted 遷移時に発火。
 * 個人プラン: オーナー本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 *
 * Staff が「発注する」を押した時、Owner と他メンバーにも控えメールが届くことで
 * 社内共有を自動化する典型ユースケース。closing なし (事実通知のみ)。
 */
export function orderAcceptedControlEmail({
  recipientName,
  jobTitle,
  contractorName,
  tradeType,
  headcount,
  firstWorkDate,
  workEndDate,
  decidedAt,
}: OrderAcceptedControlEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("受注者", contractorName),
    tradeType ? listItem("職種", tradeType) : "",
    typeof headcount === "number" ? listItem("人数", `${headcount}人`) : "",
    listItem("初回稼働日", firstWorkDate),
    workEndDate ? listItem("工期終了日（応募確定時）", workEndDate) : "",
    listItem("発注確定日時", decidedAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」への発注を確定しました`,
    html: renderLayout({
      title: `「${jobTitle}」への発注を確定しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の案件について、発注を確定しました。"),
        ...items,
      ].join(""),
    }),
  };
}
