import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { ScoutJobInfo } from "@/components/messaging/message-list";

/**
 * スカウトメッセージに添付された案件情報 (ScoutInfoCard 表示用) を取得する。
 *
 * サーバー (スレッド詳細ページの初期描画) とクライアント (Realtime 受信時)
 * の両方から同じロジックで呼ぶ。RLS で案件が閲覧できない場合
 * (下書き・削除済み等) は null を返し、呼び出し側はカードを描画しない。
 */
export async function fetchScoutJobInfo(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<ScoutJobInfo | null> {
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, status, trade_types, headcount, recruit_end_date, reward_lower, reward_upper, work_start_date, work_end_date",
    )
    .eq("id", jobId)
    .single();

  if (!job) return null;

  const { data: jobAreaRows } = await supabase
    .from("job_areas")
    .select("prefecture, municipality")
    .eq("job_id", job.id);

  return {
    id: job.id,
    title: job.title,
    tradeTypes: job.trade_types ?? [],
    headcount: job.headcount,
    recruitEndDate: job.recruit_end_date,
    rewardLower: job.reward_lower,
    rewardUpper: job.reward_upper,
    areas: (jobAreaRows ?? []).map((a) => ({
      prefecture: a.prefecture,
      municipality: a.municipality,
    })),
    workStartDate: job.work_start_date,
    workEndDate: job.work_end_date,
    isClosed: job.status === "closed",
  };
}
