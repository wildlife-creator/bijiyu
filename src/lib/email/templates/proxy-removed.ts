import { APP_URL, listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ProxyRemovedEmailProps {
  /** 受信者 (削除された本人 = ビジ友運営スタッフ) の表示名 */
  recipientName: string;
  /** 削除対象組織の Owner の client_profiles.display_name */
  organizationName: string;
  /** 削除操作者の表示名 */
  actorName: string;
  /** 削除日時 (YYYY/MM/DD HH:MM 形式) */
  removedAt: string;
  /** 他組織での代理在籍が残っているか (true = 5.7.A-1, false = 5.7.A-2) */
  hasRemainingMembership: boolean;
}

/**
 * §5.7.A 代理アカウント解除通知（本人宛、残存有無で末尾段落分岐）。
 *
 * 発火: `deleteMemberAction` で代理 staff (`is_proxy_account=true`) の
 * `organization_members` 行が物理削除された時。
 *
 * 配信先: 削除された本人 1 名 (= ビジ友運営スタッフ)。
 *
 * `hasRemainingMembership` で末尾の 1 段落のみ切り替え:
 *   - true (A-1): 他組織で代理続行 → 「他の法人組織での代理業務は引き続き継続します。」
 *   - false (A-2): 全組織で代理外れた (= delete_staff_member RPC の globally_deleted=true)
 *     → 「すべての法人組織での代理アカウント設定が解除されました。」
 *
 * 件名は両ケース共通。closing は §5.4.A / §5.6.A と同じセキュリティ通知パターン。
 */
export function proxyRemovedEmail({
  recipientName,
  organizationName,
  actorName,
  removedAt,
  hasRemainingMembership,
}: ProxyRemovedEmailProps): { subject: string; html: string } {
  const contactUrl = `${APP_URL}/contact`;
  const remainingNotice = hasRemainingMembership
    ? "他の法人組織での代理業務は引き続き継続します。"
    : "すべての法人組織での代理アカウント設定が解除されました。";
  return {
    subject: `【ビジ友 運営】「${organizationName}」の代理アカウント設定が解除されました`,
    html: renderLayout({
      title: `${organizationName} の代理アカウント設定が解除されました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("下記の組織の代理アカウントから削除されました。"),
        listItem("法人名", organizationName),
        listItem("削除操作者", actorName),
        listItem("削除日時", removedAt, { blockEnd: true }),
        paragraph(remainingNotice),
        paragraph("身に覚えがない場合は、お手数ですが下記のお問い合わせ窓口までご連絡ください。"),
        paragraph(`お問い合わせ窓口: ${contactUrl}`, { last: true }),
      ].join(""),
    }),
  };
}
