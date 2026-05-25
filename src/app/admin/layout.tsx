import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";

/**
 * 管理者ルートの共通レイアウト（video-display Task 5.1）。
 *
 * ミドルウェアの `/admin/*` admin role 制限に加え、ここでも `role='admin'` を
 * 再チェックする（二重防御）。admin 以外は /login に飛ばす。
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

  if (!user) redirect("/login");

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userRow?.role !== "admin") redirect("/login");

  return (
    <div className="min-h-dvh bg-muted">
      <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
        <Link href="/admin/dashboard" className="text-body-lg font-bold text-secondary">
          ビジ友 管理画面
        </Link>
        <nav className="flex items-center gap-4 text-body-sm">
          <Link href="/admin/users" className="text-foreground hover:underline">
            ユーザー一覧
          </Link>
        </nav>
      </header>
      <main>{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
