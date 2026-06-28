import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ContactOpsNotificationEmailProps {
  /** フォーム入力（会社名／屋号、required） */
  companyName: string;
  /** フォーム入力（送信者氏名、required） */
  name: string;
  /** フォーム入力（電話番号、required） */
  phone: string;
  /** フォーム入力 email（required） */
  email: string;
  /** お問い合わせ種類（CONTACT_INQUIRY_TYPES のラベル） */
  inquiryType: string;
  /** YYYY/MM/DD HH:MM */
  receivedAt: string;
  /**
   * ログイン状態。
   *   ログイン中: `{ kind: "logged_in"; memberDisplayName: string }`
   *   未ログイン: `{ kind: "anonymous" }`
   */
  loginStatus:
    | { kind: "logged_in"; memberDisplayName: string }
    | { kind: "anonymous" };
  /** deep link 用の site URL（host header 由来、末尾スラッシュなし） */
  siteUrl: string;
  /** contacts.id（URL のみ使用、本文には列挙しない） */
  contactId: string;
}

/**
 * §7.1.B お問い合わせ運営通知（COM-008）。M-07 準拠。
 *
 * 配信先: `OPS_NOTIFICATION_EMAIL`（既存 env var を流用）。
 *
 * - 件名「【ビジ友 運営】」プレフィックス
 * - ブロック化: 送信者情報 5 行 + 空行 + 内容情報 2 行 + 空行 + deep link
 *   （`blockEnd: true` で 20px gap を入れて視覚的に分離）
 * - 内容（`detail`）は本文に含めない（M-07 minimal、admin 画面で確認）
 * - 添付ファイル情報も本文不要
 * - URL の直前に「ログインした状態で〜」警告文を必ず置く（middleware の next 非対応のため）
 * - 生 UUID は本文列挙しない（`${contactId}` は URL のみ）
 * - closing なし
 */
export function contactOpsNotificationEmail({
  companyName,
  name,
  phone,
  email,
  inquiryType,
  receivedAt,
  loginStatus,
  siteUrl,
  contactId,
}: ContactOpsNotificationEmailProps): { subject: string; html: string } {
  const loginStatusValue =
    loginStatus.kind === "logged_in"
      ? `ログイン中（${loginStatus.memberDisplayName} 様）`
      : "未ログイン送信";

  const deepLink = `${siteUrl}/admin/contacts/${contactId}`;

  return {
    subject: `【ビジ友 運営】お問い合わせを受信しました`,
    html: renderLayout({
      title: "お問い合わせを受信しました",
      bodyContent: [
        paragraph("お問い合わせを受信しました。"),

        // 送信者情報ブロック（5 行）
        listItem("会社名／屋号", companyName),
        listItem("送信者", name),
        listItem("メールアドレス", email),
        listItem("電話番号", phone),
        listItem("ログイン状態", loginStatusValue, { blockEnd: true }),

        // 内容情報ブロック（2 行）
        listItem("お問い合わせの種類", inquiryType),
        listItem("受信日時", receivedAt, { blockEnd: true }),

        // deep link + ログイン警告文
        paragraph("ログインした状態で以下の URL を開いて詳細をご確認ください:"),
        paragraph(deepLink, { last: true }),
      ].join(""),
    }),
  };
}
