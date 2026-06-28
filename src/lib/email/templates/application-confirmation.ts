import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ApplicationConfirmationEmailProps {
  /** 受信者 (応募した受注者本人) の表示名 */
  applicantName: string;
  /** 応募した案件のタイトル */
  jobTitle: string;
  /** 発注者表示名 (`resolveParticipantName` で解決済) */
  clientName: string;
  /** 職種。複数なら呼び出し側で「、」区切り結合済の文字列。NULL/未設定なら省略 */
  tradeType?: string;
  /** エリア (例: 「東京都 港区」、複数なら「東京都 港区 他N件」)。NULL なら省略 */
  area?: string;
  /** 応募人数。NULL なら行ごと省略 */
  headcount?: number | null;
  /** 応募日時 (YYYY/MM/DD HH:MM、呼び出し側で整形) */
  appliedAt: string;
}

/**
 * §1.1.B 受注者宛応募控え / §1.4.B (=§1.1.B 流用) (統合テンプレ)。
 *
 * `applyJobAction` で applications INSERT 成功後に発火。応募した受注者本人 1 通宛。
 * スカウト経由 / 通常応募で文面の差別化なし (§1.4.B = §1.1.B 流用)。
 *
 * closing: 「発注者から返信があり次第、改めてお知らせします。」(M-01 / M-04 準拠)。
 */
export function applicationConfirmationEmail({
  applicantName,
  jobTitle,
  clientName,
  tradeType,
  area,
  headcount,
  appliedAt,
}: ApplicationConfirmationEmailProps): { subject: string; html: string } {
  const items = [
    listItem("案件名", jobTitle),
    listItem("発注者", clientName),
    tradeType ? listItem("職種", tradeType) : "",
    area ? listItem("エリア", area) : "",
    typeof headcount === "number" ? listItem("応募人数", `${headcount}人`) : "",
    listItem("応募日時", appliedAt, { blockEnd: true }),
  ].filter(Boolean);

  return {
    subject: `【ビジ友】「${jobTitle}」へのご応募を受け付けました`,
    html: renderLayout({
      title: `「${jobTitle}」へのご応募を受け付けました`,
      bodyContent: [
        paragraph(`${applicantName} 様`),
        paragraph("下記の案件へのご応募を受け付けました。"),
        ...items,
        paragraph("発注者から返信があり次第、改めてお知らせします。", {
          last: true,
        }),
      ].join(""),
    }),
  };
}
