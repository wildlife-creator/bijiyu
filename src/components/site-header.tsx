"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Menu, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/login/actions";

interface MenuItem {
  label: string;
  href: string;
}

// Unauthenticated menu
const GUEST_MENU: MenuItem[] = [
  { label: "ログイン", href: "/login" },
  { label: "新規会員登録", href: "/register" },
  { label: "ビジ友とは", href: "#" },
  { label: "パスワードを忘れた方はこちら", href: "/reset-password" },
  { label: "お問合せ", href: "#" },
];

// Authenticated: REQ-AUTH-008 受注者メニュー（常に表示）
const CONTRACTOR_MENU: MenuItem[] = [
  { label: "募集案件一覧", href: "/jobs/search" },   // CON-002
  { label: "発注者一覧", href: "/clients" },       // CON-005
  { label: "マイリスト", href: "/favorites" },     // CON-007
  { label: "メッセージ/スカウト一覧", href: "#" },  // CON-008
  { label: "応募履歴一覧", href: "#" },            // CON-011
  { label: "空き日程一覧", href: "#" },            // CON-014
  { label: "本人確認・CCUS登録", href: "/profile/verification" }, // COM-003
  { label: "プロフィール", href: "/profile" },     // COM-001
  { label: "有料プラン案内", href: "#" },          // CLI-026
  { label: "よくある質問", href: "#" },            // COM-007
  { label: "お問い合わせ", href: "#" },            // COM-008
];

// REQ-AUTH-008 発注者メニュー（課金後に追加表示）
const CLIENT_MENU: MenuItem[] = [
  { label: "募集現場一覧", href: "/jobs/manage" },   // CLI-001
  { label: "応募者一覧", href: "#" },              // CLI-007
  { label: "発注履歴一覧", href: "#" },            // CLI-010
  { label: "発注者情報詳細", href: "#" },          // CLI-020
];

function MenuItemLink({ item }: { item: MenuItem }) {
  const isDisabled = item.href === "#";

  if (isDisabled) {
    return (
      <span className="block border-b border-border px-3 py-3 text-body-md text-muted-foreground">
        {item.label}
      </span>
    );
  }

  return (
    <SheetClose asChild>
      <Link
        href={item.href}
        className="block border-b border-border px-3 py-3 text-body-md text-foreground transition-colors hover:bg-accent"
      >
        {item.label}
      </Link>
    </SheetClose>
  );
}

interface SiteHeaderProps {
  isAuthenticated?: boolean;
  hasActiveSubscription?: boolean;
}

export function SiteHeader({
  isAuthenticated = false,
  hasActiveSubscription = false,
}: SiteHeaderProps) {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  const mainMenu = isAuthenticated ? CONTRACTOR_MENU : GUEST_MENU;

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
      <Link href={isAuthenticated ? "/mypage" : "/"} className="flex items-center">
        <img
          src="/images/logo-horizontal.png"
          alt="ビジ友"
          width={100}
          height={32}
        />
      </Link>

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
            {mainMenu.map((item) => (
              <MenuItemLink key={item.label} item={item} />
            ))}
          </nav>

          {isAuthenticated && hasActiveSubscription && (
            <>
              <div className="px-3 pb-1 pt-4 text-body-sm font-bold text-muted-foreground">
                発注者メニュー
              </div>
              <nav>
                {CLIENT_MENU.map((item) => (
                  <MenuItemLink key={item.label} item={item} />
                ))}
              </nav>
            </>
          )}

          {isAuthenticated && (
            <div className="p-4">
              <Button
                variant="outline"
                className="w-full justify-center gap-2 rounded-pill text-destructive hover:text-destructive"
                onClick={handleLogout}
                disabled={isPending}
              >
                <LogOut className="size-4" />
                {isPending ? "ログアウト中..." : "ログアウト"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </header>
  );
}
