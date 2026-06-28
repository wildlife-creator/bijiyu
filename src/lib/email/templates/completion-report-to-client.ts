import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface CompletionReportToClientEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 完了報告を提出した受注者の表示名 (`getUserDisplayName(prefer-company)`) */
  contractorName: string;
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
 * §3.1.A 片側完了催促 (受注者が先に提出 → 発注者宛 broadcast)。
 *
 * `submitContractorReportAction` で `client_reviews` INSERT 成功時、
 * かつ相手側 `user_reviews` が未提出のときのみ発火。
 *
 * 個人プラン: 案件オーナー本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 * 件名に「要対応」 (相手の提出がないと案件が完結しないため)。
 * 評価点数・稼働状況の内容は両方揃うまで非公開 (バイアス防止)。
 *
 * 用語 (M-06): 件名「完了報告」/ 本文 opening「完了評価」/ closing「作業報告と評価」。
 */
export function completionReportToClientEmail({
  recipientName,
  contractorName,
  jobTitle,
  tradeType,
  workEndDate,
  reportedAt,
}: CompletionReportToClientEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("受注者", contractorName),
    tradeType ? listItem("職種", tradeType) : "",
    workEndDate ? listItem("工期終了日(応募確定時)", workEndDate) : "",
    listItem("報告日時", reportedAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友・要対応】${contractorName}さんから完了報告が届きました`,
    html: renderLayout({
      title: `${contractorName}さんから完了報告が届きました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(
          `下記の案件について、${contractorName}さんから完了評価が届きました。`,
          { tight: true },
        ),
        paragraph("作業報告と評価の入力をお願いします。"),
        ...items,
      ].join(""),
    }),
  };
}
