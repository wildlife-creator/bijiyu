import { listItem, paragraph, renderLayout } from "@/lib/email/components";

interface ProxyAssignedExistingUserEmailProps {
  /** 受信者 (= 設定された ビジ友運営スタッフ) の表示名 */
  recipientName: string;
  /** 設定先の法人組織名 (client_profiles.display_name 解決済み) */
  organizationName: string;
  /** 設定操作者の表示名 (actor の姓名スペースなし結合) */
  actorName: string;
  /** 設定日時 (yyyy/MM/dd HH:mm 形式) */
  assignedAt: string;
}

/**
 * §5.6.C 代理アカウント設定通知（本人宛）。後付け / reuse 2 ケース統合版。
 *
 * proxy-account-multi-org-support 由来。
 * 発火: createMemberAction の既存ユーザー再利用パス、または updateMemberAction の `is_proxy_account: false → true`。
 * （新規招待時の代理 ON は §5.1-Proxy が単独でカバーし、§5.6.C は飛ばない）
 *
 * 2026-06-24 完全分離アプローチ採用後の確定形:
 *   - サインインリンク CTA を削除（本人は既にログイン可能 / CTA は §5.1-Proxy に集約）
 *   - 事実通知 + 業務上の補足説明（代理マークの可視性）に専念
 *
 * NOTE: 将来 `proxy-assigned.ts` にリネーム予定（spec §5.6 共通コード改修事項）。
 */
export function proxyAssignedExistingUserEmail({
  recipientName,
  organizationName,
  actorName,
  assignedAt,
}: ProxyAssignedExistingUserEmailProps): { subject: string; html: string } {
  return {
    subject: `【ビジ友 運営】「${organizationName}」の代理アカウントとして設定されました`,
    html: renderLayout({
      title: `${organizationName} の代理アカウントとして設定されました`,
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("あなたが下記の法人組織の代理アカウントとして設定されました。"),
        listItem("法人名", organizationName),
        listItem("設定操作者", actorName),
        listItem("設定日時", assignedAt, { blockEnd: true }),
        paragraph(`このアカウントから、${organizationName} のスタッフとしてメッセージ送信などを行えるようになりました。`),
        paragraph("代理として送信したメッセージには、発注者側の画面でのみ「代理」マークが付きます。受注者側には表示されません。", { last: true }),
      ].join(""),
    }),
  };
}
