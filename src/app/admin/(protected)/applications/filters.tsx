"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADMIN_APPLICATION_CATEGORY_LABELS,
  type AdminApplicationCategory,
} from "@/lib/admin/application-status";

interface AdminApplicationFiltersProps {
  initialKeyword: string;
  /** "all" | AdminApplicationCategory */
  initialCategory: string;
  /**
   * "applied_desc" | "applied_asc" | "fwd_asc" | "fwd_desc"
   * 並び替えは結果右上の ⇅ ボタン（AdminApplicationSortButton）で操作する。
   * このフィルタには UI を出さず、検索時に現在の並び順を維持するために passthrough する。
   */
  initialSort: string;
  /** ドリルダウン絞り込み（検索時に保持する） */
  jobId?: string;
  clientId?: string;
}

/**
 * ADM-013 のキーワード検索＋8分類ステータス絞込。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 * 並び替え（sort）は結果右上の ⇅ ボタンが即時反映するため、ここでは現在値を
 * 引き継いで検索時に維持するだけ。ドリルダウン（jobId / clientId）も維持する。
 */
export function AdminApplicationFilters({
  initialKeyword,
  initialCategory,
  initialSort,
  jobId,
  clientId,
}: AdminApplicationFiltersProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [category, setCategory] = useState(initialCategory || "all");

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (category && category !== "all") params.set("category", category);
    // 並び替えは ⇅ ボタンが管理する。検索時は現在の並び順を維持する。
    if (initialSort && initialSort !== "applied_desc") {
      params.set("sort", initialSort);
    }
    if (jobId) params.set("jobId", jobId);
    if (clientId) params.set("clientId", clientId);
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    router.push(`/admin/applications${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="admin-app-keyword" className="text-body-sm font-bold">
          キーワード
        </label>
        <div className="relative mt-1">
          <img
            src="/images/icons/icon-search.png"
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
          />
          <Input
            id="admin-app-keyword"
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="氏名・メール・案件タイトル・発注者名"
            className="bg-background pl-9"
          />
        </div>
      </div>

      <div>
        <label className="text-body-sm font-bold">ステータス</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="mt-1 w-full bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {(
              Object.entries(ADMIN_APPLICATION_CATEGORY_LABELS) as Array<
                [AdminApplicationCategory, string]
              >
            ).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSearch}
          className="h-9 rounded-full bg-primary px-10 text-body-md text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
