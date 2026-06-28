import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VideoPublishedEmailProps {
  recipientName: string;
  /** OPTION_LABELS[optionType] で解決した動画種別 (「受注者PR動画」/「職場紹介動画」)。 */
  optionLabel: string;
  /** YYYY/MM/DD (Server Action 実行時刻)。 */
  publishedAt: string;
}

/**
 * §6.6.C-User 動画掲載完了通知 (申込者向け、新規)。
 *
 * 発火: admin Server Action (`updateVideoUrlAction` / `updateWorkplaceVideoUrlAction`)
 * 末尾、**初回登録 (NULL → URL) のみ**。差し替え / 削除では送信しない。
 * 配信: 申込者本人 + 法人プランなら組織メンバー全員 (M-03 broadcast)。
 * closing なし (§4.2 承認通知と同じ事実通知のみシンプルパターン)。
 */
export function videoPublishedEmail({
  recipientName,
  optionLabel,
  publishedAt,
}: VideoPublishedEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友】動画の掲載が完了しました`,
    html: renderLayout({
      title: "動画の掲載が完了しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(
          "お申し込みいただいた動画オプションについて、動画の掲載が完了しました。",
        ),
        listItem("動画種別", optionLabel),
        listItem("掲載完了日", publishedAt, { last: true }),
      ].join(""),
    }),
  };
}
