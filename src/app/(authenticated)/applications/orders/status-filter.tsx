"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BASE_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "発注済み", label: "発注済み" },
  { value: "評価登録未入力", label: "評価登録未入力" },
  { value: "評価登録済み", label: "評価登録済み" },
  { value: "キャンセル・お断り", label: "キャンセル・お断り" },
  { value: "取引完了", label: "取引完了" },
];

const APPLIED_OPTION = { value: "応募あり（未対応）", label: "応募あり（未対応）" };

interface StatusFilterProps {
  basePath?: string;
  includeApplied?: boolean;
}

export function StatusFilter({
  basePath = "/applications/orders",
  includeApplied = false,
}: StatusFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get("status") || "all";

  const options = includeApplied
    ? [BASE_OPTIONS[0], APPLIED_OPTION, ...BASE_OPTIONS.slice(1)]
    : BASE_OPTIONS;

  function handleFilterChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    params.delete("page");
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="mt-4 space-y-1">
      <p className="text-body-sm font-semibold text-foreground">ステータス</p>
      <Select value={filter} onValueChange={handleFilterChange}>
        <SelectTrigger className="h-12 w-full rounded-[8px]">
          <SelectValue placeholder="お選びください" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
