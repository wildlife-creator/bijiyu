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
  /** "applied_desc" | "applied_asc" | "fwd_asc" | "fwd_desc" */
  initialSort: string;
  /** ドリルダウン絞り込み（検索時に保持する） */
  jobId?: string;
  clientId?: string;
}

const SORT_ITEMS: { value: string; label: string }[] = [
  { value: "applied_desc", label: "応募日が新しい順" },
  { value: "applied_asc", label: "応募日が古い順" },
  { value: "fwd_asc", label: "初回稼働日が早い順" },
  { value: "fwd_desc", label: "初回稼働日が遅い順" },
];

/**
 * ADM-013 のキーワード検索＋8分類ステータス絞込＋並び替え。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 * ドリルダウン（jobId / clientId）は検索しても維持する。
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
  const [sort, setSort] = useState(initialSort || "applied_desc");

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (category && category !== "all") params.set("category", category);
    if (sort && sort !== "applied_desc") params.set("sort", sort);
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
        <Input
          id="admin-app-keyword"
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・メール・案件タイトル・発注者名"
          className="mt-1 bg-background"
        />
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

      <div>
        <label className="text-body-sm font-bold">並び替え</label>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="mt-1 w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_ITEMS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSearch}
          className="rounded-full bg-secondary text-white hover:bg-secondary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
