import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VideoOptionActivatedEmailProps {
  recipientName: string;
  /** 「プロフィール動画」/「ユーザー撮影プラン」/「ビジ友公式SNS動画」 (OPTION_LABELS[optionType] で解決)。 */
  optionLabel: string;
  /** YYYY/MM/DD */
  activatedAt: string;
}

/**
 * §6.6.B-User 動画オプション申し込み完了 (申込者向け、新規)。
 *
 * 発火: `checkout.session.completed` → `handleVideoOption` / `handleVideoWorkplaceOption` 末尾。
 * 配信: 申込者本人 + 法人プランなら組織メンバー全員 (M-03 broadcast)。
 * closing「今後の進め方については、運営よりご連絡いたします。」は次のアクション案内
 * (動画オプションは購入即掲載ではなく運営作業介在の 2 ステップフローのため)。
 * P11（2026-09-10）で「動画制作・撮影手配について」から汎用文に変更: ユーザー撮影プラン
 * （本人が撮影し素材を送る）にも合う 1 文にし、プラン別の分岐は設けない（ユーザー判断）。
 */
export function videoOptionActivatedEmail({
  recipientName,
  optionLabel,
  activatedAt,
}: VideoOptionActivatedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】動画オプションのお申し込みを承りました`,
    html: renderLayout({
      title: "動画オプションのお申し込みを承りました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("以下の内容で動画オプションのお申し込みを承りました。"),
        listItem("お申し込みオプション", optionLabel),
        listItem("ご利用開始日", activatedAt, { blockEnd: true }),
        paragraph(
          "今後の進め方については、運営よりご連絡いたします。",
          { last: true },
        ),
      ].join(""),
    }),
  };
}
