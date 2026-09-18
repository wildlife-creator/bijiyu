"use client";

import { AdminFilterForm } from "@/components/admin/admin-filter-form";
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
   * このフォームには UI を出さず、検索時に現在の並び順を維持するために引き継ぐだけ。
   */
  initialSort: string;
  /** ドリルダウン絞り込み（検索時に保持する） */
  jobId?: string;
  clientId?: string;
  /**
   * 「もどる」の戻り先（`resolveBackTo` 済みの値）。検索で URL を組み直しても
   * 落とさずに維持する（落とすと ADM-004 →「応募◯件」→ 検索 → もどる がダッシュボードに飛ぶ）
   */
  backTo?: string | null;
}

const CATEGORY_ITEMS = [
  { value: "all", label: "すべて" },
  ...(
    Object.entries(ADMIN_APPLICATION_CATEGORY_LABELS) as Array<
      [AdminApplicationCategory, string]
    >
  ).map(([value, label]) => ({ value, label })),
];

/** ADM-013 のキーワード検索＋8 分類ステータス絞り込み。 */
export function AdminApplicationFilters({
  initialKeyword,
  initialCategory,
  initialSort,
  jobId,
  clientId,
  backTo,
}: AdminApplicationFiltersProps) {
  return (
    <AdminFilterForm
      basePath="/admin/applications"
      keywordId="admin-app-keyword"
      keywordPlaceholder="氏名・メール・案件タイトル・発注者名"
      initialKeyword={initialKeyword}
      selects={[
        { name: "category", label: "ステータス", initialValue: initialCategory, items: CATEGORY_ITEMS },
      ]}
      passthrough={{
        // 既定の並び順は URL に付けない
        sort: initialSort && initialSort !== "applied_desc" ? initialSort : undefined,
        jobId,
        clientId,
        backTo,
      }}
    />
  );
}
