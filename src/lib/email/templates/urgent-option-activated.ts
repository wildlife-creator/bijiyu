import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface UrgentOptionActivatedEmailProps {
  recipientName: string;
  /** 案件名 (jobs.title)。件名と本文に動的差し込み。 */
  jobTitle: string;
  /** YYYY/MM/DD 形式の掲載期限 (start_date + 7 日)。 */
  endDate: string;
}

/**
 * §6.6.A 急募オプション申し込み完了 (新規)。
 *
 * 発火: `checkout.session.completed` → `handleUrgentOption` 末尾。
 * 配信: 申込者 = 案件オーナー (`jobs.owner_id`)、法人プランなら組織メンバー全員 (M-03 broadcast)。
 * 件名は §1.1.A 発注者宛と同パターンで案件名を動的に含める。
 * closing「掲載は即時開始されています。」は forward fact で次の確認アクションを画面に委ねる。
 */
export function urgentOptionActivatedEmail({
  recipientName,
  jobTitle,
  endDate,
}: UrgentOptionActivatedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】「${jobTitle}」の急募オプションお申し込みを承りました`,
    html: renderLayout({
      title: "急募オプションのお申し込みを承りました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(
          "下記の案件について、急募オプションのお申し込みを承りました。",
        ),
        listItem("案件名", jobTitle),
        listItem("急募期間", "7 日間"),
        listItem("掲載期限", endDate, { blockEnd: true }),
        paragraph("掲載は即時開始されています。", { last: true }),
      ].join(""),
    }),
  };
}
