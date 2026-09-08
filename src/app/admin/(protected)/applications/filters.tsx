"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PendingOverlay } from "@/components/shared/pending-overlay";
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
  /**
   * 「もどる」の戻り先（`resolveBackTo` 済みの値）。検索で URL を組み直しても
   * 落とさずに維持する（ステージング指摘 No.35: ADM-004 →「応募◯件」→ 検索 → もどる
   * がダッシュボードに飛んでいた）
   */
  backTo?: string | null;
}

/**
 * ADM-013 のキーワード検索＋8分類ステータス絞込。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 * 並び替え（sort）は結果右上の ⇅ ボタンが即時反映するため、ここでは現在値を
 * 引き継いで検索時に維持するだけ。ドリルダウン（jobId / clientId）と backTo も維持する。
 *
 * ブラウザの戻る/進むで URL（= initial*）が変わったときに入力欄の表示も追従させるため、
 * URL 由来の初期値を key にして内部 state を作り直す（ステージング指摘 No.40）。
 * 検索ボタンを押すまでの入力途中の値は、URL が変わらない限り保持される。
 */
export function AdminApplicationFilters(props: AdminApplicationFiltersProps) {
  const resetKey = `${props.initialKeyword}|${props.initialCategory}|${props.jobId ?? ""}|${props.clientId ?? ""}`;
  return <AdminApplicationFiltersInner key={resetKey} {...props} />;
}

function AdminApplicationFiltersInner({
  initialKeyword,
  initialCategory,
  initialSort,
  jobId,
  clientId,
  backTo,
}: AdminApplicationFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
    if (backTo) params.set("backTo", backTo);
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    startTransition(() =>
      router.push(
        `/admin/applications${params.toString() ? `?${params}` : ""}`,
      ),
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <PendingOverlay active={isPending} />
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
          disabled={isPending}
          className="h-9 rounded-full bg-primary px-10 text-body-md text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
