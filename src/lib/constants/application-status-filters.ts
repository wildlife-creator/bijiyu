import type { StatusFilterOption } from "@/components/shared/status-filter";

/** 応募履歴（CON-011、`?filter=`）のステータス絞り込み。 */
export const HISTORY_STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { value: "all", label: "すべて" },
  { value: "応募結果待ち", label: "応募結果待ち" },
  { value: "稼働予定", label: "稼働予定" },
  { value: "評価登録未入力", label: "評価登録未入力" },
  { value: "評価登録済み", label: "評価登録済み" },
  { value: "落選・キャンセル", label: "落選・キャンセル" },
  { value: "取引完了", label: "取引完了" },
];

/** 発注履歴（CLI-010、`?status=`）のステータス絞り込み。発注可否決定以降の応募だけを扱う。 */
export const ORDERS_STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  { value: "all", label: "すべて" },
  { value: "発注済み", label: "発注済み" },
  { value: "評価登録未入力", label: "評価登録未入力" },
  { value: "評価登録済み", label: "評価登録済み" },
  { value: "キャンセル・お断り", label: "キャンセル・お断り" },
  { value: "取引完了", label: "取引完了" },
];

/**
 * 案件別の応募一覧（CLI-007B）は全ステータスを扱うため、発注履歴の選択肢に
 * 「応募あり（未対応）」を「すべて」の直後に足したもの。
 */
export const APPLICANTS_STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  ORDERS_STATUS_FILTER_OPTIONS[0],
  { value: "応募あり（未対応）", label: "応募あり（未対応）" },
  ...ORDERS_STATUS_FILTER_OPTIONS.slice(1),
];
