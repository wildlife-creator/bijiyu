// rating-redesign: 発注者→受注者の7項目★×5評価の定数。
// 閾値変更はこのファイル1箇所のみ修正で対応可能（DB マイグレーション不要）。

/** CLI-005 高評価バッジを表示する最小評価件数 */
export const HIGH_RATING_BADGE_MIN_COUNT = 3 as const;

/** CLI-005 高評価バッジを表示する最小★平均 */
export const HIGH_RATING_BADGE_MIN_AVG = 4.0 as const;

/**
 * 評価7項目の定義。
 * key は user_reviews のカラム名（snake_case）。
 * 表示順は CLI-012 入力フォーム・CLI-028 集計表示で共有する。
 */
export const RATING_ITEMS = [
  { key: "rating_overall", label: "総合評価", required: true },
  { key: "rating_punctual", label: "稼働予定日にくる", required: false },
  { key: "rating_follows_instructions", label: "指示通りに動ける", required: false },
  { key: "rating_speed", label: "作業の速さ", required: false },
  { key: "rating_quality", label: "作業の丁寧さ", required: false },
  { key: "rating_has_tools", label: "作業に関する道具を持っている", required: false },
  { key: "rating_has_special_equipment", label: "特別な道具/重機等を持っている", required: false },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  required: boolean;
}>;

/** user_reviews の星評価カラム名（snake_case） */
export type RatingItemKey = (typeof RATING_ITEMS)[number]["key"];
