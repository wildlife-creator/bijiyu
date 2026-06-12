/**
 * ADM-013（応募履歴一覧）のキーワード検索ヘルパー。
 *
 * キーワードは ①users（氏名/メール）→ applicant id 集合
 * ②jobs（title）＋③client_profiles（display_name）→ job id 集合 に展開し、
 * applications への .or() で OR 結合する。
 *
 * PostgREST は空の in.() を構文エラーにするため、
 * **空でない id 集合の枝だけ**で .or() 文字列を組み立てる（本モジュールの責務）。
 * 全集合が空の場合は null を返し、呼び出し側はクエリを発行せず0件を返す。
 */

/** 各 id 集合の取得上限。超過時は一覧に「より具体的なキーワード」を促す注記を出す */
export const KEYWORD_ID_SET_LIMIT = 1000;

export function buildApplicationsKeywordOr(sets: {
  applicantIds: string[];
  jobIds: string[];
}): string | null {
  const applicantIds = Array.from(new Set(sets.applicantIds));
  const jobIds = Array.from(new Set(sets.jobIds));

  const branches: string[] = [];
  if (applicantIds.length > 0) {
    branches.push(`applicant_id.in.(${applicantIds.join(",")})`);
  }
  if (jobIds.length > 0) {
    branches.push(`job_id.in.(${jobIds.join(",")})`);
  }

  return branches.length > 0 ? branches.join(",") : null;
}
