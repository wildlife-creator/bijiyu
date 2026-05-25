import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * 課金オプションの正準型と active 判定ヘルパー（video-display Task 3.4）。
 *
 * 既存リテラルを 1 箇所に集約する single source of truth。
 * priceIdForOption / 各 Zod schema / webhook 分岐がこの型を再利用することで、
 * 新オプション追加・リテラル typo がコンパイルで捕捉される。
 */

/** 正準 option_type union（要件 8.1）。 */
export type OptionType =
  | "video" // 受注者PR動画（据置）
  | "video_workplace" // 職場紹介動画（新規）
  | "urgent"
  | "compensation_5000"
  | "compensation_9800";

/** 動画オプションのみのサブセット（表示判定で使用）。 */
export type VideoOptionType = Extract<OptionType, "video" | "video_workplace">;

/**
 * 指定ユーザーが指定 option_type の active レコードを持つか判定する。
 *
 * - status='active' のみ true。'cancelled'/'expired' は（DB 側フィルタで除外され）false。
 * - **client を引数化**: 自分自身の option は通常 or admin client、CLI-006/CON-006 の
 *   ような cross-user 参照では RLS 制約のため **admin（service-role）client** を渡すこと。
 *   通常 client で他ユーザーの option を引くと RLS で空 → 常に false の静かなバグになる。
 * - error / data=null はフェイルセーフで false（動画を出さない方が安全）。
 *
 * @returns active レコードが 1 件以上あれば true
 */
export async function hasActiveOption(
  client: SupabaseClient<Database>,
  userId: string,
  optionType: VideoOptionType,
): Promise<boolean> {
  const { data, error } = await client
    .from("option_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("option_type", optionType)
    .eq("status", "active")
    .limit(1);

  if (error || !data) return false;
  return data.length > 0;
}
