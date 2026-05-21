/**
 * AreaList
 *
 * 詳細画面でエリアを全件展開して表示するコンポーネント (Req 5.4)。
 *
 * 使用想定: CON-003 案件詳細 / CLI-002 案件管理 / CLI-006 ユーザー詳細 /
 *           COM-001 プロフィール詳細 / CON-006 発注者詳細 / CLI-020 発注者ホーム
 *           + メッセージスレッド等
 *
 * formatAreasLong に委譲。0 件の場合は emptyLabel (default「エリア未設定」)。
 * Server Component で使えるよう "use client" は付けない。
 */

import {
  formatAreasLong,
  type AreaForDisplay,
} from "@/lib/utils/format-areas";
import { cn } from "@/lib/utils";

export interface AreaListProps {
  areas: AreaForDisplay[];
  emptyLabel?: string;
  className?: string;
}

export function AreaList({
  areas,
  emptyLabel = "エリア未設定",
  className,
}: AreaListProps) {
  const text = formatAreasLong(areas);
  // デフォルトで text-body-sm を付与。DetailRow 等の周辺テキストとフォントサイズを揃える。
  // caller が text-body-md 等の上書きを渡した場合は twMerge で後勝ち。
  return <p className={cn("text-body-sm", className)}>{text || emptyLabel}</p>;
}
