import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminHeaderMenu } from "@/components/admin/admin-header-menu";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";

/**
 * 管理者ルートの共通レイアウト（AdminShell）。
 *
 * route group (protected) 配下のみに認可ガードを適用する。
 * `/admin/login` はこのレイアウトの外（ガードなし）に置く（admin spec Task 4.1）。
 * ミドルウェアの `/admin/*` admin role 制限に加え、ここでも `role='admin'` を
 * 再チェックする（二重防御）。admin 以外は /admin/login に飛ばす。
 *
 * ヘッダー: ①左上にロゴ（クリックで管理者トップへ） ②右上にハンバーガーメニュー
 * （トップと同じメニュー＋パスワード変更・ログアウト。全 admin 画面から到達可能。REQ-ADM-002）
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userRow?.role !== "admin") redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-muted">
      <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
        <Link href="/admin/dashboard" className="flex items-center">
          {/* 静的ロゴのため next/image ではなく site-header と同じ <img> を使う */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-horizontal.png"
            alt="ビジ友 管理画面"
            width={100}
            height={32}
          />
        </Link>
        <AdminHeaderMenu />
      </header>
      {/*
        全 admin ページ共通の幅上限（中央寄せ）。
        ウィンドウを広げても中身が画面端まで間延びしないようにする。
        個別ページがさらに狭い max-w（dashboard 等の max-w-md）を持つ場合はそちらが優先される。
        既存の詳細画面が max-w-2xl のため、それに合わせて全体を統一する。
      */}
      <main className="mx-auto w-full max-w-2xl">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
