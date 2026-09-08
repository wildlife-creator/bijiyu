import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ApplicationWithdrawnEmailProps {
  /** 受信者 (取り下げた受注者本人) の表示名 */
  applicantName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 発注者表示名 (`resolveParticipantName` で解決済) */
  clientName: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 取り下げ日時 (YYYY/MM/DD HH:MM) */
  withdrawnAt: string;
}

/**
 * §1.2.D 応募取り下げ控え（受注者本人 1 通宛）。§1.2.B「受注キャンセルを受け付けました」の
 * 応募段階版。「受け付けました」の動詞で他のシステム確認メールと揃える。
 * closing で「発注者にも取り下げをお知らせしました」を明示する。
 */
export function applicationWithdrawnEmail({
  applicantName,
  jobTitle,
  clientName,
  tradeType,
  headcount,
  withdrawnAt,
}: ApplicationWithdrawnEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("発注者", clientName),
    tradeType ? listItem("職種", tradeType) : "",
    typeof headcount === "number" ? listItem("人数", `${headcount}人`) : "",
    listItem("取り下げ日時", withdrawnAt, { blockEnd: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」の応募取り下げを受け付けました`,
    html: renderLayout({
      title: `「${jobTitle}」の応募取り下げを受け付けました`,
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph("下記の応募の取り下げを受け付けました。"),
        ...items,
        paragraph("発注者にも取り下げをお知らせしました。", { last: true }),
      ].join(""),
    }),
  };
}
