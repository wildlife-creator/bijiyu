/**
 * 管理画面の共通メニュー項目。
 * ADM-002 トップページ（dashboard）とヘッダーのハンバーガーメニューで共用する。
 *
 * NOTE: 「ユーザーアカウント一覧」等のリンク文言は既存 E2E
 * （e2e/video-display.spec.ts / e2e/admin.spec.ts）がクリック導線で使用しているため変えないこと。
 */
export interface AdminMenuItem {
  label: string;
  href: string;
}

export const ADMIN_MENU_ITEMS: readonly AdminMenuItem[] = [
  { label: "発注者アカウント一覧", href: "/admin/clients" },
  { label: "ユーザーアカウント一覧", href: "/admin/users" },
  { label: "本人確認承認申請一覧", href: "/admin/verifications" },
  { label: "応募履歴一覧", href: "/admin/applications" },
  { label: "お問い合わせ一覧", href: "/admin/contacts" },
  { label: "トラブル報告一覧", href: "/admin/trouble-reports" },
  { label: "求人問い合わせ一覧", href: "/admin/job-inquiries" },
  { label: "代理メッセージ一覧", href: "/admin/messages" },
] as const;
