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
  { value: "応募あり（未対応）", label: "応募あり（未対応）" },
  { value: "発注済み", label: "発注済み" },
  { value: "評価登録未入力", label: "評価登録未入力" },
  { value: "評価登録済み", label: "評価登録済み" },
  { value: "キャンセル・お断り", label: "キャンセル・お断り" },
  { value: "取引完了", label: "取引完了" },
];

export function StatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get("status") || "all";

  function handleFilterChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    params.delete("page");
    router.push(`/applications/orders?${params.toString()}`);
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
