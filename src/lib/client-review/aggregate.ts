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
 * 取得関数: 特定の被評価者（発注者）の評判を集計して返す。
 *
 * RLS（被評価者本人・同一組織・投稿者本人のみ SELECT 可）の下で動作する。
 * 取得失敗・0件のときは {goodCount:0, total:0} を返し例外を投げない（fail-safe）。
 * 引数は被評価者 ID のみ（将来「閲覧者≠被評価者」拡張の余地を残す）。
 */
export async function fetchClientReputation(
  supabase: SupabaseClient<Database>,
  clientUserId: string,
): Promise<ClientReputationSummary> {
  const { data, error } = await supabase
    .from("client_reviews")
    .select("rating_again")
    .eq("reviewee_id", clientUserId);

  if (error || !data) return { goodCount: 0, total: 0 };
  return summarizeReputation(data);
}
