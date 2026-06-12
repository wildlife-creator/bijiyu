import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { adminLogoutAction } from "@/app/admin/actions";

/**
 * ADM-002: 管理者トップページ。
 * デザインカンプ: design-assets/screens/ADM-002.png
 * （カード型のメニュー行＋下部にパスワード変更・ログアウトのテキストリンク。
 *   件数表示・ダッシュボード数値は付けない = REQ-ADM-002 確定）
 *
 * NOTE: 「ユーザーアカウント一覧」のリンク文言は既存 E2E
 * （e2e/video-display.spec.ts）がクリック導線で使用しているため変えないこと。
 */

const MENU_ITEMS = [
  { label: "発注者アカウント一覧", href: "/admin/clients" },
  { label: "ユーザーアカウント一覧", href: "/admin/users" },
  { label: "本人確認承認申請一覧", href: "/admin/verifications" },
  { label: "応募履歴一覧", href: "/admin/applications" },
  { label: "お問い合わせ一覧", href: "/admin/contacts" },
  { label: "トラブル報告一覧", href: "/admin/trouble-reports" },
  { label: "求人問い合わせ一覧", href: "/admin/job-inquiries" },
  { label: "メッセージ一覧", href: "/admin/messages" },
] as const;

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        管理者トップページ
      </h1>

      <div className="mt-8 divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between px-4 py-4 text-body-md text-foreground hover:bg-muted"
          >
            {item.label}
            <ChevronRight className="w-4 h-4 text-primary/70" />
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3 px-1">
        <Link
          href="/admin/password"
          className="block text-body-md text-foreground underline-offset-2 hover:underline"
        >
          パスワード変更
        </Link>
        <form action={adminLogoutAction}>
          <button
            type="submit"
            className="text-body-md text-foreground underline-offset-2 hover:underline"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
