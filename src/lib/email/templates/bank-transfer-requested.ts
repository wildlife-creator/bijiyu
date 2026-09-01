import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface BankTransferRequestedEmailProps {
  recipientName: string;
  /** 「ライトプラン（月払い）」「職場紹介動画」など、対象の表示名。 */
  targetLabel: string;
  /** YYYY/MM/DD HH:MM */
  requestedAt: string;
}

/**
 * 銀行振込のお申し込み受付（申込者向け、P2 新規）。
 *
 * 発火: `requestBankTransferAction` 直後（申込レコード作成後）。
 * 金額・振込先・支払期限は書かない（請求書側を正とし、アプリでは管理しない方針。
 * docs/requirements/spec-changes-202608.md §2.1(1) / 2026-09-01 確認）。
 * 事実通知のみ（§6 全体方針: マーケ調 opening・CTA なし）。
 */
export function bankTransferRequestedEmail({
  recipientName,
  targetLabel,
  requestedAt,
}: BankTransferRequestedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】銀行振込でのお申し込みを受け付けました`,
    html: renderLayout({
      title: "銀行振込でのお申し込みを受け付けました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("以下の内容で、銀行振込でのお申し込みを受け付けました。"),
        listItem("お申し込み内容", targetLabel),
        listItem("お申し込み日時", requestedAt, { blockEnd: true }),
        paragraph(
          "担当より請求書をお送りしますので、請求書に記載の方法でお振込みください。",
        ),
        paragraph(
          "ご入金の確認後にご利用開始となり、あらためてメールでお知らせします。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
