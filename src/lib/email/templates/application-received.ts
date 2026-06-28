import { listItem, paragraph, renderLayout, truncateExcerpt } from "@/lib/email/components";

interface ApplicationReceivedEmailProps {
  /** 受信者 (発注者本人 / 組織メンバー) の表示名 */
  recipientName: string;
  /** 応募された案件のタイトル */
  jobTitle: string;
  /** 応募者名 (屋号優先、`getUserDisplayName(prefer-company)`) */
  applicantName: string;
  /** 職種。複数なら呼び出し側で「、」区切り結合済の文字列。NULL/未設定なら省略 */
  tradeType?: string;
  /** 応募人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 応募日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  appliedAt: string;
  /** 応募メッセージ抜粋。trimmed空文字なら行ごと省略 */
  messageExcerpt?: string;
  /** スカウト送信日 (YYYY/MM/DD)。指定された場合 §1.4.A スカウト経由分岐に切り替わる */
  scoutSentDate?: string;
}

/**
 * §1.1.A 発注者宛応募通知 / §1.4.A スカウト経由応募通知 (統合テンプレ)。
 *
 * `applyJobAction` で applications INSERT 成功後に発火。
 * 個人プラン: 案件オーナー本人 1 通 / 法人プラン: 組織メンバー全員 (M-03)。
 *
 * §1.4.A スカウト経由分岐 (`scoutSentDate` が渡された場合):
 *   - 件名末尾に「（スカウト経由）」を追加
 *   - opening を「あなたがスカウトを送信した受注者から、〜」に切替
 *   - 【スカウト送信日】行を【応募者】直後に追加
 */
export function applicationReceivedEmail({
  recipientName,
  jobTitle,
  applicantName,
  tradeType,
  headcount,
  appliedAt,
  messageExcerpt,
  scoutSentDate,
}: ApplicationReceivedEmailProps): { subject: string; html: string } {
  const isScout = typeof scoutSentDate === "string" && scoutSentDate.length > 0;
  const subjectSuffix = isScout ? "（スカウト経由）" : "";
  const opening = isScout
    ? "あなたがスカウトを送信した受注者から、ご応募がありました。"
    : "下記の案件にご応募がありました。";

  const trimmedExcerpt = messageExcerpt?.trim() ?? "";
  const excerpt = trimmedExcerpt ? truncateExcerpt(trimmedExcerpt, 100) : "";

  const items = [
    listItem("案件名", jobTitle),
    listItem("応募者", applicantName),
    isScout ? listItem("スカウト送信日", scoutSentDate as string) : "",
    tradeType ? listItem("職種", tradeType) : "",
    typeof headcount === "number" ? listItem("応募人数", `${headcount}人`) : "",
    listItem("応募日時", appliedAt, { blockEnd: excerpt ? false : true }),
    excerpt ? listItem("メッセージ", `「${excerpt}」`, { blockEnd: true }) : "",
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」へのご応募がありました${subjectSuffix}`,
    html: renderLayout({
      title: `「${jobTitle}」へのご応募がありました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(opening),
        ...items,
        paragraph("発注可否をご検討ください。", { last: true }),
      ].join(""),
    }),
  };
}
