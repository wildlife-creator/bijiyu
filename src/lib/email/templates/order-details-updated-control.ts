import { listItem, paragraph, renderLayout } from "@/lib/email/components";
import { formatFirstWorkDateChange } from "@/lib/email/templates/order-details-updated";

interface OrderDetailsUpdatedControlEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  jobTitle: string;
  /** 受注者の表示名 (`getUserDisplayName(prefer-company)` で屋号優先) */
  contractorName: string;
  /** 変更した項目名を「、」で結合したもの（例: "初回稼働日、勤務地"） */
  changedFields: string;
  /** 初回稼働日が変わったときだけ渡す（YYYY/MM/DD） */
  firstWorkDateChange?: { before?: string; after: string };
  /** 変更日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  updatedAt: string;
}

/**
 * §1.8.B 発注内容の変更控え (発注者組織宛 broadcast)。
 *
 * `updateOrderDetailsAction` で発注内容が変更されたときに §1.8.A と並列で発火。
 * 宛先は発注確定控え (§1.6.C) と同じ（個人プラン: 本人 / 法人プラン: 組織メンバー全員）。
 */
export function orderDetailsUpdatedControlEmail({
  recipientName,
  jobTitle,
  contractorName,
  changedFields,
  firstWorkDateChange,
  updatedAt,
}: OrderDetailsUpdatedControlEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("受注者", contractorName),
    listItem("変更した項目", changedFields),
    firstWorkDateChange
      ? listItem("初回稼働日", formatFirstWorkDateChange(firstWorkDateChange))
      : "",
    listItem("変更日時", updatedAt, { last: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」の発注内容を変更しました`,
    html: renderLayout({
      title: `「${jobTitle}」の発注内容を変更しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(
          "下記の案件について、発注内容を変更しました。受注者にも変更をお知らせしています。",
        ),
        ...items,
      ].join(""),
    }),
  };
}
