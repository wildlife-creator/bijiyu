import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { adminLogoutAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
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
 * ヘッダー: ①ダッシュボードへ戻るリンク ②ログアウトボタン
 * （全 admin 画面からログアウト導線に到達できるようにする。REQ-ADM-002）
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
        <Link href="/admin/dashboard" className="text-body-lg font-bold text-secondary">
          ビジ友 管理画面
        </Link>
        <form action={adminLogoutAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-pill text-body-sm"
          >
            ログアウト
          </Button>
        </form>
      </header>
      <main>{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
