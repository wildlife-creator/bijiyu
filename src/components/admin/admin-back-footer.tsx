import Link from "next/link";

import { Button } from "@/components/ui/button";

/** 管理画面の画面下の「もどる」（戻り先はリンクで固定。backTo を解決した URL を渡す）。 */
export function AdminBackFooter({ href }: { href: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <Button asChild variant="outline" className="w-full max-w-xs rounded-full">
        <Link href={href}>もどる</Link>
      </Button>
    </div>
  );
}
