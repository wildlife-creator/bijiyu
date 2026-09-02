import type { SupabaseClient } from "@supabase/supabase-js";

import type { VideoPlacement } from "@/lib/videos/constants";
import {
  VIDEO_DISPLAY_COLUMNS,
  type VideoDisplayRow,
} from "@/lib/videos/display";
import type { Database } from "@/types/database";

/**
 * 公開中（status='ready'）の動画を表示順で取得する（表示 6 画面共通）。
 *
 * - RLS `videos_select_ready` により、ログイン済みユーザーは他人の ready 行も読める。
 *   cross-user 参照でも admin client は不要。
 * - P4 でオプション購入の有無による表示ゲートは撤廃済み。ここで option_subscriptions
 *   を見てはならない。
 * - error はフェイルセーフで空配列（動画セクションを出さない）。
 */
export async function getReadyVideos(
  client: SupabaseClient<Database>,
  userId: string,
  placement: VideoPlacement,
): Promise<VideoDisplayRow[]> {
  const { data, error } = await client
    .from("videos")
    .select(VIDEO_DISPLAY_COLUMNS)
    .eq("user_id", userId)
    .eq("placement", placement)
    .eq("status", "ready")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data;
}
