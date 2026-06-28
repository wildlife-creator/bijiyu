import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface OrderRejectedControlEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** 見送った受注者の表示名 (`getUserDisplayName(prefer-company)`) */
  contractorName: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 対応日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  decidedAt: string;
}

/**
 * §1.6.D 発注見送り控え (発注者組織宛 broadcast)。
 *
 * `rejectApplicationAction` で applied → rejected 遷移時に発火。
 * 個人プラン: オーナー本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 *
 * 初回稼働日 / 工期終了日は含めない (reject パスでは未入力)。closing なし。
 */
export function orderRejectedControlEmail({
  recipientName,
  jobTitle,
  contractorName,
  tradeType,
  decidedAt,
}: OrderRejectedControlEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("受注者", contractorName),
    tradeType ? listItem("職種", tradeType) : "",
    listItem("対応日時", decidedAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」への発注を見送りました`,
    html: renderLayout({
      title: `「${jobTitle}」への発注を見送りました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の案件について、発注を見送りました。"),
        ...items,
      ].join(""),
    }),
  };
}
