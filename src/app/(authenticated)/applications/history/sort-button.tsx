"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PendingOverlay } from "@/components/shared/pending-overlay";

export function SortButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSort = searchParams.get("sort") || "desc";
  const isAsc = currentSort === "asc";

  function handleSort() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", isAsc ? "desc" : "asc");
    params.delete("page");
    startTransition(() =>
      router.push(`/applications/history?${params.toString()}`),
    );
  }

  return (
    <>
      <PendingOverlay active={isPending} />
      <button
        type="button"
        onClick={handleSort}
        disabled={isPending}
        className="flex items-center gap-1 text-body-sm text-muted-foreground disabled:opacity-50"
      >
        <img
          src="/images/icons/icon-sort.png"
          alt="並び替え"
          className="size-5"
        />
        <span>{isAsc ? "古い順" : "新しい順"}</span>
      </button>
    </>
  );
}
