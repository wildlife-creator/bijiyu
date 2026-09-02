"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PendingOverlay } from "@/components/shared/pending-overlay";
import { resolveSortValue, type SortOption } from "@/lib/constants/sort-options";
import { buildSortSearch } from "@/lib/utils/sort-search-params";

/**
 * 一覧画面共通の並び替えプルダウン（P6 一覧改修）。
 *
 * - 並び順は URL（`?sort=`）を Single Source of Truth とし、useState は持たない
 * - 選択すると即座に router.push で並び替わり、ページ番号は 1 に戻る（検索条件は保持）
 * - 見た目はマイリストの種別プルダウン（FavoriteTypeSelect）に揃える
 * - `aria-label="並び替え"` を付け、E2E は getByLabel("並び替え") → getByRole("option") で操作する
 *
 * 選択肢は src/lib/constants/sort-options.ts の定数を渡す（先頭 = 既定）。
 */

interface SortSelectProps {
  options: readonly SortOption[];
  /** URL パラメータ名（既定 "sort"） */
  paramName?: string;
  /** アクセシブルネーム（既定 "並び替え"） */
  ariaLabel?: string;
}

export function SortSelect({
  options,
  paramName = "sort",
  ariaLabel = "並び替え",
}: SortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const value = resolveSortValue(options, searchParams.get(paramName));

  function handleChange(next: string) {
    if (next === value) return;
    const search = buildSortSearch(searchParams.toString(), next, paramName);
    startTransition(() => router.push(`${pathname}?${search}`));
  }

  return (
    <>
      <PendingOverlay active={isPending} />
      <Select value={value} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger
          aria-label={ariaLabel}
          className="h-10 min-w-40 bg-background text-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
