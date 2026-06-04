import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * 発注者の評判サマリー。
 * bad は表示しないため返さない（将来 total - goodCount で導出可能）。
 */
export interface ClientReputationSummary {
  /** rating_again = 'good' の件数（0以上） */
  goodCount: number;
  /** rating_again が記録された評価の合計件数（good + bad、分母）。0 <= goodCount <= total */
  total: number;
}

/**
 * 純粋関数: rating_again 列の配列から good 件数と合計件数を算出する。
 *
 * total の正準定義: rating_again が 'good' または 'bad' の行数（null・想定外値は除外）。
 * goodCount: rating_again = 'good' の行数。常に 0 <= goodCount <= total。
 */
export function summarizeReputation(
  rows: ReadonlyArray<{ rating_again: string | null }>,
): ClientReputationSummary {
  let goodCount = 0;
  let total = 0;
  for (const row of rows) {
    if (row.rating_again === "good") {
      goodCount += 1;
      total += 1;
    } else if (row.rating_again === "bad") {
      total += 1;
    }
    // null・想定外値は total から除外
  }
  return { goodCount, total };
}

/**
 * 評判集計のスコープ（判別ユニオン）。誤用を型で防ぐ。
 * - organization: 会社単位。`client_reviews.organization_id` 軸で会社全体を合算する。
 *   案件作成者（reviewee_id）が誰でも・担当者が辞めても固定のため、会社の評判として安定する。
 * - individual: 個人発注者。従来どおり `reviewee_id`（被評価者本人）軸で合算する。
 */
export type ReputationScope =
  | { kind: "organization"; organizationId: string }
  | { kind: "individual"; clientUserId: string };

/**
 * 取得関数: 発注者の評判を集計して返す。
 *
 * スコープに応じて集計軸を切り替える:
 * - kind="organization": `organization_id` 軸で会社全体を合算（CLI-023 で削除済みの担当者ぶんも残る）。
 *   ⚠️ 既存 RLS `can_view_client_review` は被評価者の【現在の】組織所属で判定するため、
 *   削除済み担当者の評価行はセッションクライアントでは弾かれる。組織スコープの読み取りには
 *   admin（service-role）クライアントを渡すこと（用途は自組織評判の閲覧に限定。RLS は変更しない）。
 * - kind="individual": `reviewee_id` 軸で本人の評判を合算（被評価者本人＝自分のためセッションクライアントで可）。
 *
 * 取得失敗・0件のときは {goodCount:0, total:0} を返し例外を投げない（fail-safe）。
 */
export async function fetchClientReputation(
  supabase: SupabaseClient<Database>,
  scope: ReputationScope,
): Promise<ClientReputationSummary> {
  const query = supabase.from("client_reviews").select("rating_again");
  const { data, error } =
    scope.kind === "organization"
      ? await query.eq("organization_id", scope.organizationId)
      : await query.eq("reviewee_id", scope.clientUserId);

  if (error || !data) return { goodCount: 0, total: 0 };
  return summarizeReputation(data);
}
