import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface CompletionReportToContractorEmailProps {
  /** 受信者 (受注者本人) の表示名 */
  applicantName: string;
  /** 完了報告を提出した発注者の表示名 (`resolveParticipantName()`) */
  clientName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 工期終了日 (YYYY/MM/DD)。NULL なら省略 */
  workEndDate?: string;
  /** 報告日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  reportedAt: string;
}

/**
 * §3.1.B 片側完了催促 (発注者が先に提出 → 受注者宛 1 通)。
 *
 * `submitClientReportAction` で `user_reviews` INSERT 成功時、
 * かつ相手側 `client_reviews` が未提出のときのみ発火。
 *
 * 件名に「要対応」 (相手の提出がないと案件が完結しないため)。
 *
 * §3.1.A との差: 宛先が単一の受注者本人、表示名解決は発注者 (clientName) のみ。
 */
export function completionReportToContractorEmail({
  applicantName,
  clientName,
  jobTitle,
  tradeType,
  workEndDate,
  reportedAt,
}: CompletionReportToContractorEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("発注者", clientName),
    tradeType ? listItem("職種", tradeType) : "",
    workEndDate ? listItem("工期終了日(応募確定時)", workEndDate) : "",
    listItem("報告日時", reportedAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友・要対応】${clientName}さんから完了報告が届きました`,
    html: renderLayout({
      title: `${clientName}さんから完了報告が届きました`,
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph(
          `下記の案件について、${clientName}さんから完了評価が届きました。`,
          { tight: true },
        ),
        paragraph("作業報告と評価の入力をお願いします。"),
        ...items,
      ].join(""),
    }),
  };
}
