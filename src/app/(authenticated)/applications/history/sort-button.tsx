"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SortButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") || "desc";
  const isAsc = currentSort === "asc";

  function handleSort() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", isAsc ? "desc" : "asc");
    params.delete("page");
    router.push(`/applications/history?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={handleSort}
      className="flex items-center gap-1 text-body-sm text-muted-foreground"
    >
      <img
        src="/images/icons/icon-sort.png"
        alt="並び替え"
        className="size-5"
      />
      <span>{isAsc ? "古い順" : "新しい順"}</span>
    </button>
  );
}
