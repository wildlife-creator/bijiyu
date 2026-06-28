import { listItem, paragraph, renderLayout, truncateExcerpt } from "@/lib/email/components";

interface ScoutSentBroadcastEmailProps {
  /** 受信者 (発注者組織メンバー) の表示名 */
  memberName: string;
  /** スカウト送信先 (受注者) の表示名 (`getUserDisplayName(prefer-company)` で屋号優先) */
  contractorName: string;
  /** 案件のタイトル */
  jobTitle: string;
  /** スカウト本文の先頭 100 文字 + 「...」。空文字なら【メッセージ】行を省略 */
  messageExcerpt: string;
  /** 実際にスカウトボタンを押した user の姓名 (スペースなし結合) */
  actualSenderName: string;
}

/**
 * §1.7.B スカウト送信通知 (発注者組織宛 broadcast)。
 *
 * `sendScoutAction` でスカウトメッセージ INSERT 成功後に発火。
 * 個人プラン: 送信した本人 1 通 / 法人プラン: 組織メンバー全員 (送信本人含む)。
 *
 * 本文ブロック構造: 「スカウト内容 (送信先 / 案件名 / メッセージ)」+ 空行 + 「送信者」。
 * 受信者にとって主役は「何が送信されたか」、操作者は補助メタ情報として最後に置く。
 *
 * §1.7.A 受注者宛通知 (`scoutNotificationEmail`) との差分:
 * - 件名末尾に「[案件名]」を含める (組織内メンバーが「どの案件のスカウト」を識別)
 * - 「外向き法人名 / 内向き個人名」の二段構え: §1.7.B は個人名で「誰が押したか」を可視化
 * - 代理マーク (is_proxy) は付与しない (シンプル原則)
 */
export function scoutSentBroadcastEmail({
  memberName,
  contractorName,
  jobTitle,
  messageExcerpt,
  actualSenderName,
}: ScoutSentBroadcastEmailProps): { subject: string; html: string } {
  const trimmedExcerpt = messageExcerpt.trim();
  const excerpt = trimmedExcerpt ? truncateExcerpt(trimmedExcerpt, 100) : "";

  // 「スカウト内容」ブロック (送信先 / 案件名 / メッセージ?) — 最後の行が blockEnd で区切る
  const contentBlock = excerpt
    ? [
        listItem("送信先", contractorName),
        listItem("案件名", jobTitle),
        listItem("メッセージ", `「${excerpt}」`, { blockEnd: true }),
      ]
    : [
        listItem("送信先", contractorName),
        listItem("案件名", jobTitle, { blockEnd: true }),
      ];

  return {
    subject: `【ビジ友】「${jobTitle}」へのスカウトを送信しました`,
    html: renderLayout({
      title: `「${jobTitle}」へのスカウトを送信しました`,
      bodyContent: [
        paragraph(`${memberName} 様`),
        paragraph("下記のスカウトを送信しました。"),
        ...contentBlock,
        listItem("送信者", actualSenderName, { last: true }),
      ].join(""),
    }),
  };
}
