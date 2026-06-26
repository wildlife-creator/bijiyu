import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface MatchingRejectedEmailProps {
  applicantName: string;
  jobTitle: string;
  clientName: string;
}

/**
 * §1.6.B 発注見送り（既存 E-2 改修）。受注者本人 1 名宛。
 *
 * `rejectApplicationAction` で applied → rejected 遷移時に発火。
 * M-04 準拠: 「他の案件も多数掲載されておりますので」「案件を探す」CTA を削除。
 * 「応募結果のお知らせ」件名はぼかし表現として維持（既存設計の意図的継続）。
 */
export function matchingRejectedEmail({
  applicantName,
  jobTitle,
  clientName,
}: MatchingRejectedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】応募結果のお知らせ - ${jobTitle}`,
    html: renderLayout({
      title: "応募結果のお知らせ",
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph("以下の案件について、発注者から見送りのご連絡がありました。"),
        listItem("案件名", jobTitle),
        listItem("発注者", clientName, { blockEnd: true }),
        paragraph("他の案件のご検討をお願いいたします。", { last: true }),
      ].join(""),
    }),
  };
}
