"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  totalCount: number;
  itemsPerPage?: number;
  pageParamName?: string;
}

export function PaginationControls({
  totalCount,
  itemsPerPage = 20,
  pageParamName = "page",
}: PaginationControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get(pageParamName)) || 1;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(pageParamName, String(page));
    router.push(`?${params.toString()}`);
  }

  // Build visible page numbers: show at most 5 around current
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <nav
      aria-label="ページネーション"
      className="flex items-center justify-center gap-1 py-4"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="前のページ"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {pages[0] > 1 && (
        <>
          <Button
            variant={currentPage === 1 ? "default" : "ghost"}
            size="sm"
            onClick={() => goToPage(1)}
          >
            1
          </Button>
          {pages[0] > 2 && (
            <span className="px-1 text-muted-foreground">…</span>
          )}
        </>
      )}

      {pages.map((p) => (
        <Button
          key={p}
          variant={p === currentPage ? "default" : "ghost"}
          size="sm"
          onClick={() => goToPage(p)}
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p}
        </Button>
      ))}

      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && (
            <span className="px-1 text-muted-foreground">…</span>
          )}
          <Button
            variant={currentPage === totalPages ? "default" : "ghost"}
            size="sm"
            onClick={() => goToPage(totalPages)}
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="次のページ"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </nav>
  );
}
