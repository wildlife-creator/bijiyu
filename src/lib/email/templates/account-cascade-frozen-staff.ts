import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface AccountCascadeFrozenStaffEmailProps {
  /** 凍結された通常 staff / admin 本人の表示名 (姓 + 名 スペースなし) */
  recipientName: string;
  /** 退会した Owner の `client_profiles.display_name` */
  organizationName: string;
  /** 退会した Owner の姓名 (スペースなし結合) */
  ownerName: string;
  /** カスケード実行時のタイムスタンプ (YYYY/MM/DD HH:MM) */
  withdrawnAt: string;
}

/**
 * §8.5.5 法人 Owner 退会カスケード通知 - 通常 staff / admin 向け。
 *
 * 発火: `executeWithdrawal` の組織カスケードブロック内、配下メンバーの
 * `is_proxy_account = false` の本人宛。通常 staff / admin は 1 組織のみ在籍可能
 * なので削除 = 即退会扱いで確定 (残存有無分岐なし、§5.7.5.A と並列構造)。
 *
 * §5.7.5.A 通常担当者削除通知と並列構造だが、削除原因が異なる
 * (能動的な担当者削除 vs Owner 退会カスケード) ため別テンプレ。
 *
 * closing 表現は「ご不明な点がある場合は」(§5.7.5.A の「身に覚えがない」と区別):
 * Owner 退会自体は事実だが、本人は Owner 退会を知り得ない事象であり、
 * 「身に覚えがない」では違和感のため §8.4 / §8.5 と同方針。
 *
 * 件名「【ビジ友】」プレフィックス (受信者は法人内スタッフ、§5.7.5.A と統一)。
 */
export function accountCascadeFrozenStaffEmail({
  recipientName,
  organizationName,
  ownerName,
  withdrawnAt,
}: AccountCascadeFrozenStaffEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  return {
    subject: `【ビジ友】「${organizationName}」の管理責任者の退会により、ご利用を終了しました`,
    html: renderLayout({
      title: `${organizationName} の管理責任者の退会により、ご利用を終了しました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph(
          `ご所属の「${organizationName}」の管理責任者が退会されたため、ビジ友のご利用は終了いたしました。`,
        ),
        listItem("法人名", organizationName),
        listItem("退会した管理責任者", ownerName),
        listItem("退会日時", withdrawnAt, { blockEnd: true }),
        paragraph("ご不明な点がある場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
