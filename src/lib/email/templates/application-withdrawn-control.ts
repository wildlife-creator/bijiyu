import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ApplicationWithdrawnControlEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 取り下げた受注者の表示名 (`getUserDisplayName(prefer-company)` で屋号優先) */
  contractorName: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 応募人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 取り下げ日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  withdrawnAt: string;
}

/**
 * §1.2.C 応募取り下げ通知（発注者組織宛 broadcast）。ステージング指摘 No.8 の付随対応
 * （2026-09-08）で、受注者が結果待ち（applied）の応募を自分で取り下げる機能とともに新設。
 *
 * `cancelApplicationAction` で applications.status applied → cancelled 遷移時に発火。
 * 個人プラン: 案件オーナー本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 *
 * 発注前（発注者がまだ判断していない段階）なので、§1.2.A と違い件名に「要対応」は付けない
 * （代替人員の手配は発生しない）。closing なし（事実通知のみ）。
 */
export function applicationWithdrawnControlEmail({
  recipientName,
  jobTitle,
  contractorName,
  tradeType,
  headcount,
  withdrawnAt,
}: ApplicationWithdrawnControlEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("取り下げた方", contractorName),
    tradeType ? listItem("職種", tradeType) : "",
    typeof headcount === "number" ? listItem("人数", `${headcount}人`) : "",
    listItem("取り下げ日時", withdrawnAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】${contractorName}さんが応募を取り下げました`,
    html: renderLayout({
      title: `${contractorName}さんが応募を取り下げました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の応募が、応募者により取り下げられました。"),
        ...items,
      ].join(""),
    }),
  };
}
