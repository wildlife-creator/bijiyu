import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ApplicationCancelledEmailProps {
  /** 受信者 (キャンセルした受注者本人) の表示名 */
  applicantName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 発注者表示名 (`resolveParticipantName` で解決済) */
  clientName: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 初回稼働日 (YYYY/MM/DD)。NULL なら省略 */
  firstWorkDate?: string;
  /** キャンセル日時 (YYYY/MM/DD HH:MM) */
  cancelledAt: string;
}

/**
 * §1.2.B 発注後キャンセル控え（受注者本人 1 通宛）。
 *
 * `cancelApplicationAction` で applications.status accepted → cancelled 遷移時に発火。
 * 「発注」ではなく「受注」を使用（受注者主体に揃える）。closing で「発注者にも
 * キャンセルをお知らせしました」を明示し、本人と発注者の両方に通知が出たことを示す。
 */
export function applicationCancelledEmail({
  applicantName,
  jobTitle,
  clientName,
  tradeType,
  headcount,
  firstWorkDate,
  cancelledAt,
}: ApplicationCancelledEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("発注者", clientName),
    tradeType ? listItem("職種", tradeType) : "",
    typeof headcount === "number" ? listItem("人数", `${headcount}人`) : "",
    firstWorkDate ? listItem("初回稼働日", firstWorkDate) : "",
    listItem("キャンセル日時", cancelledAt, { blockEnd: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」の受注キャンセルを受け付けました`,
    html: renderLayout({
      title: `「${jobTitle}」の受注キャンセルを受け付けました`,
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph("下記の受注のキャンセルを受け付けました。"),
        ...items,
        paragraph("発注者にもキャンセルをお知らせしました。", { last: true }),
      ].join(""),
    }),
  };
}
