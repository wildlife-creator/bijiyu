/**
 * 応募（applications）に embed した評価（client_reviews / user_reviews）が登録済みか。
 *
 * PostgREST の embed は、1 対 1 と判定されればオブジェクト（未登録は null）、
 * 1 対多と判定されれば配列（未登録は []）で返る。どちらの形でも正しく判定する。
 */
export function hasReview(embedded: unknown): boolean {
  if (embedded == null) return false;
  return !Array.isArray(embedded) || embedded.length > 0;
}
