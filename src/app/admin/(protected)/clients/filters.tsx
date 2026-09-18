"use client";

import { AdminFilterForm } from "@/components/admin/admin-filter-form";

interface AdminClientFiltersProps {
  initialKeyword: string;
  /** "all" | ClientCategory */
  initialCategory: string;
  /** "all" | "urgent" */
  initialOption: string;
}

const CATEGORY_ITEMS = [
  { value: "all", label: "すべて" },
  { value: "owner", label: "管理責任者" },
  { value: "org_admin", label: "組織管理者" },
  { value: "org_staff", label: "担当者" },
  { value: "individual", label: "個人発注者" },
  { value: "small", label: "小規模発注者" },
];

const OPTION_ITEMS = [
  { value: "all", label: "すべて" },
  { value: "urgent", label: "急募オプション" },
];

/** ADM-003 のキーワード検索 + 2 枠の絞り込み（区分／オプション・各単一選択）。 */
export function AdminClientFilters({
  initialKeyword,
  initialCategory,
  initialOption,
}: AdminClientFiltersProps) {
  return (
    <AdminFilterForm
      basePath="/admin/clients"
      keywordId="admin-client-keyword"
      keywordPlaceholder="氏名・メールアドレス・会社名"
      initialKeyword={initialKeyword}
      selects={[
        { name: "category", label: "権限", initialValue: initialCategory, items: CATEGORY_ITEMS },
        {
          name: "option",
          label: "オプションプラン加入者",
          initialValue: initialOption,
          items: OPTION_ITEMS,
        },
      ]}
    />
  );
}
