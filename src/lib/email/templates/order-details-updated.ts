import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface OrderDetailsUpdatedEmailProps {
  applicantName: string;
  jobTitle: string;
  clientName: string;
  /** 変更された項目名を「、」で結合したもの（例: "初回稼働日、勤務地"） */
  changedFields: string;
  /** 初回稼働日が変わったときだけ渡す（YYYY/MM/DD） */
  firstWorkDateChange?: { before?: string; after: string };
}

/**
 * §1.8.A 発注内容の変更（受注者本人 1 名宛）。
 *
 * `updateOrderDetailsAction` で発注確定後の発注内容（勤務地・書類・その他・初回稼働日）が
 * 変更されたときに発火。変更が無い保存では送らない。
 * 勤務地（番地）と「その他」の本文は載せない（発注確定メール §1.6.A と同じ扱い）。
 */
export function orderDetailsUpdatedEmail({
  applicantName,
  jobTitle,
  clientName,
  changedFields,
  firstWorkDateChange,
}: OrderDetailsUpdatedEmailProps): { subject: string; html: string } {
  // 項目リストの最後の行だけ、後ろの案内文との間を空ける
  const items = [
    listItem("案件名", jobTitle),
    listItem("発注者", clientName),
    listItem("変更された項目", changedFields, {
      blockEnd: !firstWorkDateChange,
    }),
    firstWorkDateChange
      ? listItem("初回稼働日", formatFirstWorkDateChange(firstWorkDateChange), {
          blockEnd: true,
        })
      : "",
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」の発注内容が変更されました`,
    html: renderLayout({
      title: "発注内容が変更されました",
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph("以下の案件について、発注者が発注内容を変更しました。"),
        ...items,
        paragraph(
          "変更後の内容は、ビジ友にログインのうえ応募履歴の「勤務についての詳細」でご確認ください。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}

export function formatFirstWorkDateChange(change: {
  before?: string;
  after: string;
}): string {
  return change.before
    ? `${change.after}（変更前：${change.before}）`
    : change.after;
}
