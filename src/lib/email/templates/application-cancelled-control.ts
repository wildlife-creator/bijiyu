import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ApplicationCancelledControlEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** キャンセルした受注者の表示名 (`getUserDisplayName(prefer-company)` で屋号優先) */
  contractorName: string;
  /** 職種。複数なら「、」区切り。NULL なら省略 */
  tradeType?: string;
  /** 応募人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 初回稼働日 (YYYY/MM/DD)。NULL なら省略 */
  firstWorkDate?: string;
  /** キャンセル日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  cancelledAt: string;
}

/**
 * §1.2.A 発注後キャンセル通知（発注者組織宛 broadcast）。
 *
 * `cancelApplicationAction` で applications.status accepted → cancelled 遷移時に発火。
 * 個人プラン: 案件オーナー本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 *
 * 件名に「要対応」を付ける (組織宛受信箱の埋もれ防止)。closing なし (事実通知のみ)。
 * 「稼働日まで残り何日」カウンター、操作誘導文は spec 上禁止。
 */
export function applicationCancelledControlEmail({
  recipientName,
  jobTitle,
  contractorName,
  tradeType,
  headcount,
  firstWorkDate,
  cancelledAt,
}: ApplicationCancelledControlEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("キャンセル者", contractorName),
    tradeType ? listItem("職種", tradeType) : "",
    typeof headcount === "number" ? listItem("人数", `${headcount}人`) : "",
    firstWorkDate ? listItem("初回稼働日", firstWorkDate) : "",
    listItem("キャンセル日時", cancelledAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友・要対応】${contractorName}さんが発注をキャンセルしました`,
    html: renderLayout({
      title: `${contractorName}さんが発注をキャンセルしました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の応募が、応募者によりキャンセルされました。"),
        ...items,
      ].join(""),
    }),
  };
}
