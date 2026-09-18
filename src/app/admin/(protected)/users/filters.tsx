"use client";

import { AdminFilterForm } from "@/components/admin/admin-filter-form";
import { VIDEO_OPTION_UI_NAMES } from "@/lib/billing/options";

interface AdminUserFiltersProps {
  initialKeyword: string;
  /** "all" | "video" | "video_shooting" | "video_sns" */
  initialOption: string;
}

// 動画 3 プランのみ（名称は料金プラン画面と同じ正式名 = VIDEO_OPTION_UI_NAMES）。
// 補償は販売停止中で加入者もいないため選択肢に含めない。急募は案件単位のため ADM-003 側に置く。
const OPTION_ITEMS = [
  { value: "all", label: "すべて" },
  { value: "video", label: VIDEO_OPTION_UI_NAMES.video },
  { value: "video_shooting", label: VIDEO_OPTION_UI_NAMES.video_shooting },
  { value: "video_sns", label: VIDEO_OPTION_UI_NAMES.video_sns },
];

/** ADM-008 のキーワード検索 + オプションプラン加入者の絞り込み。 */
export function AdminUserFilters({ initialKeyword, initialOption }: AdminUserFiltersProps) {
  return (
    <AdminFilterForm
      basePath="/admin/users"
      keywordId="admin-keyword"
      keywordPlaceholder="氏名・メールアドレス"
      initialKeyword={initialKeyword}
      selects={[
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
