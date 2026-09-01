import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface BankTransferRequestedOpsEmailProps {
  /** 申込者の姓名（スペースなし結合）。 */
  applicantName: string;
  /** `client_profiles.display_name` → `users.company_name` → null（行ごと省略）。 */
  companyName: string | null;
  applicantEmail: string;
  /** YYYY/MM/DD HH:MM */
  requestedAt: string;
  /** 「ライトプラン（月払い）」「職場紹介動画」など。 */
  targetLabel: string;
  /** 本体価格（税込 JPY） */
  amount: number;
  /** 初回事務手数料（税込 JPY、0 なら行を省略） */
  initialFee: number;
  /** 申込レコード ID（deep link 用） */
  requestId: string;
  /** deep link 用 site URL（host header 由来、末尾スラッシュなし）。 */
  siteUrl: string;
}

function yen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円（税込）`;
}

/**
 * 銀行振込のお申し込み通知（運営向け、P2 新規）。M-07 準拠。
 *
 * 配信先: `process.env.OPS_NOTIFICATION_EMAIL`。
 * 運営はこの通知を受けて請求書を作成・送付し（アプリ外）、入金確認後に
 * 管理画面（/admin/bank-transfers/{id}）で有効化する。
 */
export function bankTransferRequestedOpsEmail({
  applicantName,
  companyName,
  applicantEmail,
  requestedAt,
  targetLabel,
  amount,
  initialFee,
  requestId,
  siteUrl,
}: BankTransferRequestedOpsEmailProps): { subject: string; html: string } {
  const deepLink = `${siteUrl}/admin/bank-transfers/${requestId}`;
  const total = amount + initialFee;
  const bodyParts: string[] = [
    paragraph("銀行振込でのお申し込みがありました。"),
    paragraph("申込者へ請求書を送付し、入金確認後に管理画面で有効化してください。"),
    listItem("申込者", applicantName),
  ];
  if (companyName !== null && companyName.trim() !== "") {
    bodyParts.push(listItem("会社名", companyName));
  }
  bodyParts.push(
    listItem("メールアドレス", applicantEmail),
    listItem("申込日時", requestedAt),
    listItem("お申し込み内容", targetLabel),
    listItem("本体価格", yen(amount)),
  );
  if (initialFee > 0) {
    bodyParts.push(listItem("初回事務手数料", yen(initialFee)));
  }
  bodyParts.push(
    listItem("請求合計", yen(total), { blockEnd: true }),
    paragraph(
      "申込の詳細・有効化は下記からご確認いただけます。ログインした状態でクリックしてください。",
    ),
    paragraph(deepLink, { last: true }),
  );

  return {
    subject: `【ビジ友 運営】銀行振込のお申し込みがありました（請求書の送付をお願いします）`,
    html: renderLayout({
      title: "銀行振込のお申し込みがありました",
      bodyContent: bodyParts.join(""),
    }),
  };
}
