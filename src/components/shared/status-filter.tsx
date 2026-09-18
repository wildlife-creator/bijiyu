"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PendingOverlay } from "@/components/shared/pending-overlay";

export interface StatusFilterOption {
  value: string;
  label: string;
}

interface StatusFilterProps {
  /** 選択肢（先頭は「すべて」= value "all" を想定） */
  options: StatusFilterOption[];
  /** URL のクエリ名（例: "status" / "filter"） */
  paramName: string;
  /** 遷移先のパス（例: "/applications/orders"） */
  basePath: string;
}

/**
 * 一覧画面共通のステータス絞り込みプルダウン（応募履歴 CON-011 / 発注履歴 CLI-010 / 案件別応募一覧 CLI-007B）。
 *
 * 選択中の値は URL の searchParams を Single Source of Truth とする。
 * 選択すると、他の検索条件（並び替え・jobId 等）は引き継いだまま `paramName` だけ差し替え、
 * `page` を落として 1 ページ目から表示する。
 */
export function StatusFilter({ options, paramName, basePath }: StatusFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = searchParams.get(paramName) || "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(paramName, value);
    } else {
      params.delete(paramName);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => router.push(`${basePath}${query ? `?${query}` : ""}`));
  }

  return (
    <div className="mt-4 space-y-1">
      <PendingOverlay active={isPending} />
      <p className="text-body-sm font-semibold text-foreground">ステータス</p>
      <Select value={current} onValueChange={handleChange} disabled={isPending}>
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
