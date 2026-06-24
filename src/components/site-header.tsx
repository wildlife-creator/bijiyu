"use client";

import Link from "next/link";
import { useTransition } from "react";
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
import { logoutAction } from "@/app/(auth)/login/actions";

interface MenuItem {
  label: string;
  href: string;
  paidOnly?: boolean;
}

// design-assets/screens/UI-header-logout.png 上段
const GUEST_PRIMARY: MenuItem[] = [
  { label: "ログイン", href: "/login" },
  { label: "新規会員登録", href: "/register" },
  { label: "ビジ友とは", href: "/" },
];

// design-assets/screens/UI-header-logout.png 下段
const GUEST_SECONDARY: MenuItem[] = [
  { label: "パスワードを忘れた方はこちら", href: "/reset-password" },
  { label: "お問合せ", href: "/contact" },
];

// design-assets/screens/UI-header-login.png 上段
const AUTH_PRIMARY: MenuItem[] = [
  { label: "マイページ", href: "/mypage" },
  { label: "募集案件一覧", href: "/jobs/search" },
  { label: "マイリスト", href: "/favorites" },
  { label: "メッセージ・スカウト", href: "/messages" },
  { label: "自社への応募一覧", href: "/applications/received", paidOnly: true },
  { label: "自社の発注履歴一覧", href: "/applications/orders", paidOnly: true },
  { label: "自社の募集現場一覧", href: "/jobs/manage", paidOnly: true },
];

// design-assets/screens/UI-header-login.png 下段
const AUTH_SECONDARY: MenuItem[] = [
  { label: "プラン変更", href: "/billing" },
  { label: "本人確認・CCUS登録", href: "/profile/verification" },
  { label: "ユーザープロフィール", href: "/profile" },
  { label: "自社の発注者情報詳細", href: "/mypage/client-profile", paidOnly: true },
  { label: "パスワード再設定", href: "/reset-password" },
  { label: "お問い合わせ", href: "/contact" },
];

function PrimaryItem({ item }: { item: MenuItem }) {
  return (
    <SheetClose asChild>
      <Link
        href={item.href}
        className="block border-b border-border px-4 py-4 text-body-md text-foreground transition-colors hover:bg-accent"
      >
        {item.label}
      </Link>
    </SheetClose>
  );
}

function SecondaryItem({ item }: { item: MenuItem }) {
  return (
    <SheetClose asChild>
      <Link
        href={item.href}
        className="block text-body-sm text-foreground underline-offset-2 hover:underline"
      >
        {item.label}
      </Link>
    </SheetClose>
  );
}

interface SiteHeaderProps {
  isAuthenticated?: boolean;
  hasActiveSubscription?: boolean;
  /**
   * N 組織兼任スタッフ向けの組織切替 UI。
   * memberships が 1 以下のときはコンポーネント側で null を返すため、
   * 単一組織ユーザーには DOM 出力されない。
   * RSC でメンバーシップを解決した状態で `<OrgSwitcher>` を渡す。
   */
  orgSwitcher?: React.ReactNode;
}

export function SiteHeader({
  isAuthenticated = false,
  hasActiveSubscription = false,
  orgSwitcher,
}: SiteHeaderProps) {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  const primary = isAuthenticated ? AUTH_PRIMARY : GUEST_PRIMARY;
  const secondary = isAuthenticated ? AUTH_SECONDARY : GUEST_SECONDARY;
  const showPaid = isAuthenticated && hasActiveSubscription;

  const visiblePrimary = primary.filter(
    (item) => !item.paidOnly || showPaid,
  );
  const visibleSecondary = secondary.filter(
    (item) => !item.paidOnly || showPaid,
  );

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
      <Link
        href={isAuthenticated ? "/mypage" : "/"}
        className="flex items-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo-horizontal.png"
          alt="ビジ友"
          width={100}
          height={32}
        />
      </Link>

      <div className="flex items-center gap-3">
        {isAuthenticated && orgSwitcher}
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
              {visiblePrimary.map((item) => (
                <PrimaryItem key={item.label} item={item} />
              ))}
            </nav>

            <div className="space-y-3 p-4">
              {visibleSecondary.map((item) => (
                <SecondaryItem key={item.label} item={item} />
              ))}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isPending}
                  className="block text-body-sm text-destructive underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {isPending ? "ログアウト中..." : "ログアウト"}
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
