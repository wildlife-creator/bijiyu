import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface MatchingAcceptedEmailProps {
  applicantName: string;
  jobTitle: string;
  clientName: string;
  /** 単一なら "型枠大工"、複数なら "型枠大工、鉄筋工" のように事前結合して渡す。 */
  tradeType?: string;
  firstWorkDate: string;
  /** jobs.work_end_date。NULL 時は省略。 */
  workEndDate?: string;
}

/**
 * §1.6.A 受注決定（既存 E-1 改修）。受注者本人 1 名宛。
 *
 * `acceptApplicationAction` で applied → accepted 遷移時に発火。
 * M-04 準拠: 「おめでとうございます」「応募履歴を確認する」CTA 等の過剰表現・UI 名指しを削除。
 */
export function matchingAcceptedEmail({
  applicantName,
  jobTitle,
  clientName,
  tradeType,
  firstWorkDate,
  workEndDate,
}: MatchingAcceptedEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("発注者", clientName),
    tradeType ? listItem("職種", tradeType) : "",
    listItem("初回稼働日", firstWorkDate),
    workEndDate ? listItem("工期終了日（応募確定時）", workEndDate, { last: true }) : "",
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」の受注が決定しました`,
    html: renderLayout({
      title: `受注が決定しました`,
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph("以下の案件で受注が決定しました。"),
        ...items,
      ].join(""),
    }),
  };
}
