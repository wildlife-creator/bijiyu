import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * 管理者ランディング（video-display Task 5.1）。
 *
 * ミドルウェアが admin ログイン直後に `/admin/dashboard` へ redirect するため、
 * 404 を解消する最小ページ。ADM-008（ユーザー一覧）への導線を置く。
 */
export default function AdminDashboardPage() {
  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        管理ダッシュボード
      </h1>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          asChild
          size="lg"
          className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
        >
          <Link href="/admin/users">ユーザーアカウント一覧</Link>
        </Button>
      </div>
    </div>
  );
}
