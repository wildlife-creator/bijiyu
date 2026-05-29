import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** 単一項目の集計結果。avg は未評価のとき null。 */
export interface OverallSummary {
  /** ★平均（1.00〜5.00、小数2桁丸め）。評価あり件が0なら null */
  avg: number | null;
  /** 評価あり件数（0以上） */
  count: number;
}

/** 7項目それぞれの集計結果 */
export interface PerItemSummary {
  overall: OverallSummary;
  punctual: OverallSummary;
  followsInstructions: OverallSummary;
  speed: OverallSummary;
  quality: OverallSummary;
  hasTools: OverallSummary;
  hasSpecialEquipment: OverallSummary;
}

/** NULL を除外して平均（小数2桁）と件数を出す。0件なら avg=null。 */
function summarize(values: ReadonlyArray<number | null>): OverallSummary {
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  if (present.length === 0) return { avg: null, count: 0 };
  const sum = present.reduce((acc, v) => acc + v, 0);
  return { avg: Math.round((sum / present.length) * 100) / 100, count: present.length };
}

/** 単一受注者の総合評価サマリー（CLI-006 / バッジ判定用） */
export async function fetchOverallSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OverallSummary> {
  const { data, error } = await supabase
    .from("user_reviews")
    .select("rating_overall")
    .eq("reviewee_id", userId);

  if (error || !data) return { avg: null, count: 0 };
  return summarize(data.map((r) => r.rating_overall));
}

/** 単一受注者の7項目別サマリー（CLI-028） */
export async function fetchPerItemSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PerItemSummary> {
  const { data, error } = await supabase
    .from("user_reviews")
    .select(
      "rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment",
    )
    .eq("reviewee_id", userId);

  const rows = error || !data ? [] : data;
  return {
    overall: summarize(rows.map((r) => r.rating_overall)),
    punctual: summarize(rows.map((r) => r.rating_punctual)),
    followsInstructions: summarize(rows.map((r) => r.rating_follows_instructions)),
    speed: summarize(rows.map((r) => r.rating_speed)),
    quality: summarize(rows.map((r) => r.rating_quality)),
    hasTools: summarize(rows.map((r) => r.rating_has_tools)),
    hasSpecialEquipment: summarize(rows.map((r) => r.rating_has_special_equipment)),
  };
}

/**
 * 複数受注者の総合評価サマリーをまとめて取得（CLI-005 一覧用）。
 * 1クエリで取得し JS 側で reviewee_id ごとに集計（N+1 回避）。
 * 評価0件の userId は Map に含まれない（呼び出し元で {avg:null,count:0} に既定化）。
 */
export async function fetchBulkOverallSummary(
  supabase: SupabaseClient<Database>,
  userIds: ReadonlyArray<string>,
): Promise<Map<string, OverallSummary>> {
  const result = new Map<string, OverallSummary>();
  if (userIds.length === 0) return result;

  const { data, error } = await supabase
    .from("user_reviews")
    .select("reviewee_id, rating_overall")
    .in("reviewee_id", userIds as string[]);

  if (error || !data) return result;

  const grouped = new Map<string, number[]>();
  for (const row of data) {
    const list = grouped.get(row.reviewee_id) ?? [];
    list.push(row.rating_overall);
    grouped.set(row.reviewee_id, list);
  }
  for (const [id, values] of grouped) {
    result.set(id, summarize(values));
  }
  return result;
}
