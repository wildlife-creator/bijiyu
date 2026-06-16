"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Menu, ChevronRight } from "lucide-react";

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
 * 管理画面ヘッダー右上のハンバーガーメニュー。
 *
 * ADM-002 トップページと同じメニュー項目（ADMIN_MENU_ITEMS）＋
 * パスワード変更・ログアウトを表示し、全 admin 画面からどのメニューにも
 * 到達できる導線を提供する（REQ-ADM-002）。
 * パスワード変更・ログアウトは小さめの文字。ログアウトは赤字（一般ユーザーと統一）。
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
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-heading-sm">メニュー</SheetTitle>
        </SheetHeader>

        <nav>
          {ADMIN_MENU_ITEMS.map((item) => (
            <SheetClose asChild key={item.href}>
              <Link
                href={item.href}
                className="flex items-center justify-between border-b border-border px-4 py-3 text-body-md text-foreground transition-colors hover:bg-accent"
              >
                {item.label}
                <ChevronRight className="w-4 h-4 text-primary/70" />
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
              パスワード変更
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
