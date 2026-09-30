import Link from "next/link";

import { Button } from "@/components/ui/button";

interface AdminPaginationProps {
  /** 前のページの URL。無い（1 ページ目）なら null でボタンを出さない */
  prevHref: string | null;
  /** 次のページの URL。無い（最終ページ）なら null でボタンを出さない */
  nextHref: string | null;
  /** 1 ページの件数（ボタンの文言「＜前の20件」に使う） */
  pageSize: number;
}

/** 管理画面の一覧共通のページ送り（「＜前のN件」「次のN件＞」）。前後どちらも無ければ何も出さない。 */
export function AdminPagination({ prevHref, nextHref, pageSize }: AdminPaginationProps) {
  if (!prevHref && !nextHref) return null;
  return (
    <div className="mt-4 flex justify-center gap-3">
      {prevHref && (
        <Button asChild variant="outline" className="rounded-full">
          <Link href={prevHref}>＜前の{pageSize}件</Link>
        </Button>
      )}
      {nextHref && (
        <Button asChild variant="outline" className="rounded-full">
          <Link href={nextHref}>次の{pageSize}件＞</Link>
        </Button>
      )}
    </div>
  );
}
