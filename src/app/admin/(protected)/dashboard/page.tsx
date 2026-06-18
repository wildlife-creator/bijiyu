import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { adminLogoutAction } from "@/app/admin/actions";
import { ADMIN_MENU_ITEMS } from "@/lib/admin/menu-items";

/**
 * ADM-002: 管理者トップページ。
 * デザインカンプ: design-assets/screens/ADM-002.png
 * （カード型のメニュー行＋下部にパスワード変更・ログアウトのテキストリンク。
 *   件数表示・ダッシュボード数値は付けない = REQ-ADM-002 確定）
 *
 * メニュー項目はヘッダーのハンバーガーと共用（@/lib/admin/menu-items）。
 */

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        管理者トップページ
      </h1>

      <div className="mt-8 divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {ADMIN_MENU_ITEMS.map((item) => (
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
          className="block text-body-sm text-foreground underline-offset-2 hover:underline"
        >
          パスワード変更
        </Link>
        <form action={adminLogoutAction}>
          <button
            type="submit"
            className="text-body-sm text-destructive underline-offset-2 hover:underline"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
