export type ScheduleRow = {
  id: string;
  start_date: string;
  end_date: string;
};

export type ScheduleCandidate = {
  start_date: string;
  end_date: string;
};

/**
 * 閉区間 [start_date, end_date] で期間重複を判定する純粋関数。
 * `excludeId` を指定した場合、その id を持つ行は判定対象から外す（自分自身の編集対象を除外する用途）。
 */
export function hasOverlappingSchedule(
  existing: readonly ScheduleRow[],
  candidate: ScheduleCandidate,
  options?: { excludeId?: string },
): boolean {
  return existing.some((row) => {
    if (options?.excludeId && row.id === options.excludeId) return false;
    return !(
      row.end_date < candidate.start_date ||
      row.start_date > candidate.end_date
    );
  });
}
