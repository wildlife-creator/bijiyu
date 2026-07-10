/**
 * 職人検索（CLI-005）の経験年数フィルタ。
 *
 * UI の範囲ラベル（contractor-search-filter.tsx の EXPERIENCE_YEARS_OPTIONS）を
 * `user_skills.experience_years`（integer）に対する数値境界へ変換する。
 *
 * 境界規則: 下限を含み、上限は含まない（非重複）。
 *   例: 3 年ちょうどは "1〜3年" ではなく "3〜5年" 側に入る。
 * NULL（未記載）はいずれの境界にも一致しない（＝検索から除外される）。
 * ANY 一致: 受注者が複数の対応職種を持つ場合、いずれか 1 つでも範囲に入れば
 *           その受注者はヒットする（呼び出し側の user_id 集合で表現）。
 */

export interface ExperienceYearsBounds {
  /** 下限（この値を含む）。未指定なら下限なし */
  gte?: number;
  /** 上限（この値を含まない）。未指定なら上限なし */
  lt?: number;
}

/**
 * 範囲ラベルを数値境界に変換する。未知のラベル（"all" / "" 等）は null。
 */
export function experienceYearsBounds(
  label: string,
): ExperienceYearsBounds | null {
  switch (label) {
    case "1年未満":
      return { lt: 1 };
    case "1〜3年":
      return { gte: 1, lt: 3 };
    case "3〜5年":
      return { gte: 3, lt: 5 };
    case "5〜10年":
      return { gte: 5, lt: 10 };
    case "10年以上":
      return { gte: 10 };
    default:
      return null;
  }
}

/**
 * 1 つの経験年数値がラベルの範囲に一致するか。
 * years が null / undefined（未記載）の場合、および未知ラベルは常に false。
 */
export function experienceYearsMatches(
  years: number | null | undefined,
  label: string,
): boolean {
  const bounds = experienceYearsBounds(label);
  if (!bounds) return false;
  if (years === null || years === undefined) return false;
  if (bounds.gte !== undefined && years < bounds.gte) return false;
  if (bounds.lt !== undefined && years >= bounds.lt) return false;
  return true;
}
