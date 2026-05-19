/**
 * AreaSummary
 *
 * カード共通のエリア省略表示コンポーネント (Req 5.3 / 5.5)。
 * default maxVisible=3 で、4 件以上は末尾「他Nエリア」を付与。
 *
 * 使用想定: 案件カード (CON-002 等) / 職人カード / 発注者カード / マイリスト /
 *           スカウト情報カード等
 *
 * formatAreasShort に委譲。0 件の場合は emptyLabel (default「エリア未設定」)。
 * Server Component で使えるよう "use client" は付けない。
 */

import {
  formatAreasShort,
  type AreaForDisplay,
} from "@/lib/utils/format-areas";

export interface AreaSummaryProps {
  areas: AreaForDisplay[];
  /** カードで表示する最大単位数 (default 3) */
  maxVisible?: number;
  emptyLabel?: string;
  className?: string;
}

export function AreaSummary({
  areas,
  maxVisible = 3,
  emptyLabel = "エリア未設定",
  className,
}: AreaSummaryProps) {
  const text = formatAreasShort(areas, maxVisible);
  return <span className={className}>{text || emptyLabel}</span>;
}
