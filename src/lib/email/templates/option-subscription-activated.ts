import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface OptionSubscriptionActivatedEmailProps {
  recipientName: string;
  /** OPTION_LABELS[optionType] で解決した日本語表記。例: 「補償（5,000円/月、最大200万円）」 */
  optionLabel: string;
  /** YYYY/MM/DD */
  activatedAt: string;
}

/**
 * §6.5.A 補償オプション申し込み完了（新規）。
 *
 * 発火: `checkout.session.completed` → `handleCompensationOption` 末尾。
 * 件名「お申し込みを承りました」は §6.1-A プラン変更「承りました」と語彙統一。
 * closing は positive forward fact「補償をご利用いただけます」で契約成立を明示。
 */
export function optionSubscriptionActivatedEmail({
  recipientName,
  optionLabel,
  activatedAt,
}: OptionSubscriptionActivatedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】補償オプションのお申し込みを承りました`,
    html: renderLayout({
      title: "補償オプションのお申し込みを承りました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("以下の内容で補償オプションのお申し込みを承りました。"),
        listItem("お申し込みオプション", optionLabel),
        listItem("ご利用開始日", activatedAt, { blockEnd: true }),
        paragraph(
          "給与未払いトラブル発生時の補償をご利用いただけます。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
