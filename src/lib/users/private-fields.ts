import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * users の非公開列（email / birth_date / password_set_at 等）は会員セッションから
 * SELECT できない（列権限。20260929140000_member_read_guards.sql）。本人の行でも同じ。
 *
 * - 本人の非公開列 → `fetchMyPrivateProfile()`（RPC get_my_private_profile）
 * - 他の会員の年齢 → `fetchUserAges()`（RPC get_user_ages。生年月日そのものは返さない）
 * - 他の会員のメールアドレス（通知メールの宛先）→ サーバー側で admin client から読む
 */

export interface MyPrivateProfile {
  email: string | null;
  birthDate: string | null;
  passwordSetAt: string | null;
}

/** ログイン中の本人の非公開列。未ログイン・取得失敗は null。 */
export async function fetchMyPrivateProfile(
  supabase: SupabaseClient<Database>,
): Promise<MyPrivateProfile | null> {
  const { data, error } = await supabase.rpc("get_my_private_profile");
  if (error) {
    console.error("[fetchMyPrivateProfile] rpc failed", error);
    return null;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    email: row.email ?? null,
    birthDate: row.birth_date ?? null,
    passwordSetAt: row.password_set_at ?? null,
  };
}

/**
 * 会員の年齢（日本時間の今日で数える）を user_id → 年齢 の Map で返す。
 * 生年月日が未登録の会員・取得に失敗した場合は Map に入らない（表示側は年齢を出さない）。
 */
export async function fetchUserAges(
  supabase: SupabaseClient<Database>,
  userIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  const ages = new Map<string, number>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return ages;

  const { data, error } = await supabase.rpc("get_user_ages", { p_user_ids: ids });
  if (error) {
    console.error("[fetchUserAges] rpc failed", error);
    return ages;
  }
  for (const row of data ?? []) {
    if (row.age !== null && row.age !== undefined) ages.set(row.user_id, row.age);
  }
  return ages;
}
