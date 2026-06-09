"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * マイリスト（CON-007）案件表示中の締切並べ替えボタン。
 * 既存の SortButton（応募管理）と同じ見た目（アイコン + 文字）。
 * 既定は「締切が近い順」(asc)、押すたびに 近い順 / 遠い順 を切り替える。
 */
export function FavoriteSortButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAsc = (searchParams.get("sort") || "asc") !== "desc";

  function handleSort() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", isAsc ? "desc" : "asc");
    params.delete("page");
    router.push(`/favorites?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={handleSort}
      className="flex shrink-0 items-center gap-1 text-body-sm text-muted-foreground"
    >
      <img
        src="/images/icons/icon-sort.png"
        alt="並び替え"
        className="size-5"
      />
      <span>{isAsc ? "締切が近い順" : "締切が遠い順"}</span>
    </button>
  );
}
