"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** ⇅ を押すたびに順送りする 4 種類の並び順。 */
const SORT_CYCLE: { value: string; label: string }[] = [
  { value: "applied_desc", label: "応募日が新しい順" },
  { value: "applied_asc", label: "応募日が古い順" },
  { value: "fwd_asc", label: "初回稼働日が早い順" },
  { value: "fwd_desc", label: "初回稼働日が遅い順" },
];

/**
 * ADM-013 応募履歴一覧の並び替え（結果右上にちょこんと置く）。
 * ⇅ をクリックするたびに 4 種類を順送りし、即座に URL を更新して一覧を並び替える。
 * 検索ボタンを待たない。キーワード・ステータス等の他のフィルタ値は維持する。
 */
export function AdminApplicationSortButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentValue = searchParams.get("sort") ?? "applied_desc";
  const currentIndex = Math.max(
    0,
    SORT_CYCLE.findIndex((o) => o.value === currentValue),
  );

  function handleClick() {
    const next = SORT_CYCLE[(currentIndex + 1) % SORT_CYCLE.length];
    const params = new URLSearchParams(searchParams.toString());
    if (next.value === "applied_desc") {
      params.delete("sort");
    } else {
      params.set("sort", next.value);
    }
    // 並び順を変えたら 1 ページ目に戻す。
    params.delete("page");
    router.push(`/admin/applications${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`並び替え: ${SORT_CYCLE[currentIndex].label}（押すと次の順番に切り替わります）`}
      className="flex shrink-0 items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground"
    >
      <img
        src="/images/icons/icon-sort.png"
        alt=""
        className="size-5 shrink-0"
      />
      <span>{SORT_CYCLE[currentIndex].label}</span>
    </button>
  );
}
