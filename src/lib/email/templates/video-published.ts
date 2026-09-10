import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface VideoPublishedEmailProps {
  recipientName: string;
  /** VIDEO_PLACEMENT_MEMBER_LABELS[placement] で解決した掲載先 (「ユーザー詳細ページ」/「発注者詳細ページ」)。P10 で動画種別から変更。 */
  placementLabel: string;
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
  placementLabel,
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
        listItem("掲載先", placementLabel),
        listItem("掲載完了日", publishedAt, { last: true }),
      ].join(""),
    }),
  };
}
