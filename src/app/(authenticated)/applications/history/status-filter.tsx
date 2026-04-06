"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILTER_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "応募結果待ち", label: "応募結果待ち" },
  { value: "稼働予定", label: "稼働予定" },
  { value: "評価登録未入力", label: "評価登録未入力" },
  { value: "評価登録済み", label: "評価登録済み" },
  { value: "落選・キャンセル", label: "落選・キャンセル" },
  { value: "取引完了", label: "取引完了" },
];

interface StatusFilterProps {
  currentSort?: string;
}

export function StatusFilter({ currentSort }: StatusFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Single source of truth: URL searchParams
  const filter = searchParams.get("filter") || "all";

  function handleFilterChange(value: string) {
    const params = new URLSearchParams();
    if (value && value !== "all") params.set("filter", value);
    if (currentSort) params.set("sort", currentSort);
    router.push(`/applications/history?${params.toString()}`);
  }

  return (
    <div className="mt-4 space-y-1">
      <p className="text-body-sm font-semibold text-foreground">ステータス</p>
      <Select value={filter} onValueChange={handleFilterChange}>
        <SelectTrigger className="h-12 w-full rounded-[8px]">
          <SelectValue placeholder="お選びください" />
        </SelectTrigger>
        <SelectContent>
          {FILTER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
