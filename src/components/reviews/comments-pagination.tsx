import Link from "next/link";

interface CommentsPaginationProps {
  currentPage: number;
  totalPages: number;
  /** ページ番号 → 遷移先 URL（searchParams を保持したまま組み立てる） */
  hrefForPage: (page: number) => string;
  /** 1ページあたりの件数（ボタンラベル用） */
  pageSize: number;
}

/**
 * コメント一覧の「＜前のN件 / 次のN件＞」ページング。
 * 2ページ以上の場合のみ描画する（Server Component 同士で使う前提）。
 */
export function CommentsPagination({
  currentPage,
  totalPages,
  hrefForPage,
  pageSize,
}: CommentsPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      {currentPage > 1 ? (
        <Link
          href={hrefForPage(currentPage - 1)}
          className="rounded-pill border border-border px-5 py-2 text-body-sm text-foreground"
        >
          ＜前の{pageSize}件
        </Link>
      ) : (
        <span className="rounded-pill border border-border px-5 py-2 text-body-sm text-muted-foreground opacity-50">
          ＜前の{pageSize}件
        </span>
      )}
      {currentPage < totalPages ? (
        <Link
          href={hrefForPage(currentPage + 1)}
          className="rounded-pill border border-border px-5 py-2 text-body-sm text-foreground"
        >
          次の{pageSize}件＞
        </Link>
      ) : (
        <span className="rounded-pill border border-border px-5 py-2 text-body-sm text-muted-foreground opacity-50">
          次の{pageSize}件＞
        </span>
      )}
    </div>
  );
}
