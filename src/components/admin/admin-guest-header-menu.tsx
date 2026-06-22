"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

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
 * 管理者ログイン画面（ADM-001）右上のハンバーガーメニュー（未ログイン用）。
 * デザインカンプ: design-assets/screens/UI-header-logout-b.png
 */
export function AdminGuestHeaderMenu() {
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
          <SheetClose asChild>
            <Link
              href="/admin/login"
              className="block border-b border-border px-4 py-4 text-body-md text-foreground transition-colors hover:bg-accent"
            >
              ログイン
            </Link>
          </SheetClose>
        </nav>

        <div className="space-y-3 p-4">
          <SheetClose asChild>
            <Link
              href="/reset-password"
              className="block text-body-sm text-foreground underline-offset-2 hover:underline"
            >
              パスワードを忘れた方はこちら
            </Link>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
