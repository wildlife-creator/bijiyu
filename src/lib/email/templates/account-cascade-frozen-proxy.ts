import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface AccountCascadeFrozenProxyEmailProps {
  /** 凍結された代理 staff 本人の表示名 (姓 + 名 スペースなし) */
  recipientName: string;
  /** 退会した Owner の `client_profiles.display_name` */
  organizationName: string;
  /** 退会した Owner の姓名 (スペースなし結合) */
  ownerName: string;
  /** カスケード実行時のタイムスタンプ (YYYY/MM/DD HH:MM) */
  withdrawnAt: string;
  /** 他組織での代理在籍が残っているか (true = §8.5.A-1, false = §8.5.A-2) */
  hasRemainingMembership: boolean;
}

/**
 * §8.5.A-1 / §8.5.A-2 法人 Owner 退会カスケード通知 - 代理 staff 向け。
 *
 * 発火: `executeWithdrawal` の組織カスケードブロック内、配下メンバーの
 * `is_proxy_account = true` の本人宛。`hasRemainingMembership` で末尾 1 段落のみ分岐:
 *   - A-1 (true): 「他の法人組織での代理業務は引き続き継続します。」
 *   - A-2 (false): 「すべての法人組織での代理アカウント設定が解除されました。」
 *
 * §5.7.A 代理アカウント解除通知と並列構造だが、削除原因が異なる
 * (能動的な担当者削除 vs Owner 退会カスケード) ため別テンプレ。
 *
 * closing 表現は「ご不明な点がある場合は」(§5.7.A の「身に覚えがない」と区別):
 * Owner 退会自体は事実だが、代理 staff は Owner 退会を知り得ない事象であり、
 * 「身に覚えがない」では違和感のため §8.4 と同方針。
 *
 * 件名「【ビジ友 運営】」プレフィックス (M-07 適用、受信者はビジ友運営スタッフ)。
 */
export function accountCascadeFrozenProxyEmail({
  recipientName,
  organizationName,
  ownerName,
  withdrawnAt,
  hasRemainingMembership,
}: AccountCascadeFrozenProxyEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  const remainingNotice = hasRemainingMembership
    ? "他の法人組織での代理業務は引き続き継続します。"
    : "すべての法人組織での代理アカウント設定が解除されました。";
  return {
    subject: `【ビジ友 運営】「${organizationName}」の管理責任者の退会により、代理アカウント設定が解除されました`,
    html: renderLayout({
      title: `${organizationName} の管理責任者の退会により、代理アカウント設定が解除されました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の組織の代理アカウントから、管理責任者の退会に伴い解除されました。"),
        listItem("法人名", organizationName),
        listItem("退会した管理責任者", ownerName),
        listItem("退会日時", withdrawnAt, { blockEnd: true }),
        paragraph(remainingNotice),
        paragraph("ご不明な点がある場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
