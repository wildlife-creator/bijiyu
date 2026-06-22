"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Menu } from "lucide-react";

import { adminLogoutAction } from "@/app/admin/actions";
import { ADMIN_MENU_ITEMS } from "@/lib/admin/menu-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

/**
 * 管理画面ヘッダー右上のハンバーガーメニュー（ログイン後）。
 * デザインカンプ: design-assets/screens/UI-header-login-b.png
 *
 * 上段（大きい行）: ADM-002 と同じ全 8 項目（ADMIN_MENU_ITEMS）。
 * 下段（小さいテキスト）: パスワード再設定・ログアウト。
 * 一般ユーザー側 SiteHeader と同じスタイル系統に揃える。
 */
export function AdminHeaderMenu() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await adminLogoutAction();
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="メニュー">
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="text-heading-sm">Menu</SheetTitle>
        </SheetHeader>

        <nav>
          {ADMIN_MENU_ITEMS.map((item) => (
            <SheetClose asChild key={item.href}>
              <Link
                href={item.href}
                className="block border-b border-border px-4 py-4 text-body-md text-foreground transition-colors hover:bg-accent"
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>

        <div className="space-y-3 p-4">
          <SheetClose asChild>
            <Link
              href="/admin/password"
              className="block text-body-sm text-foreground underline-offset-2 hover:underline"
            >
              パスワード再設定
            </Link>
          </SheetClose>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="block text-body-sm text-destructive underline-offset-2 hover:underline disabled:opacity-60"
          >
            {isPending ? "ログアウト中..." : "ログアウト"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
