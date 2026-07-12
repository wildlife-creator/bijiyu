"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PendingOverlay } from "@/components/shared/pending-overlay";

/**
 * マイリスト（CON-007）案件表示中の締切並べ替えボタン。
 * 既存の SortButton（応募管理）と同じ見た目（アイコン + 文字）。
 * 既定は「締切が近い順」(asc)、押すたびに 近い順 / 遠い順 を切り替える。
 */
export function FavoriteSortButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const isAsc = (searchParams.get("sort") || "asc") !== "desc";

  function handleSort() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", isAsc ? "desc" : "asc");
    params.delete("page");
    startTransition(() => router.push(`/favorites?${params.toString()}`));
  }

  return (
    <>
      <PendingOverlay active={isPending} />
      <button
        type="button"
        onClick={handleSort}
        disabled={isPending}
        className="flex shrink-0 items-center gap-1 text-body-sm text-muted-foreground disabled:opacity-50"
      >
        <img
          src="/images/icons/icon-sort.png"
          alt="並び替え"
          className="size-5"
        />
        <span>{isAsc ? "応募締め切りが近い順" : "応募締め切りが遠い順"}</span>
      </button>
    </>
  );
}
