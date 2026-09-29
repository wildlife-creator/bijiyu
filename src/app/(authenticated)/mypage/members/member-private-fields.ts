import { createAdminClient } from "@/lib/supabase/admin";

export interface MemberPrivateFields {
  email: string;
  passwordSetAt: string | null;
}

/**
 * 担当者管理（CLI-022〜024）で使う、メンバーのメールアドレスと招待完了日時。
 *
 * users.email / password_set_at は会員セッションから読めない列のため admin client で読む
 * （20260929140000_member_read_guards.sql）。呼び出し側は、対象が自分の組織のメンバーで
 * あることを会員セッション（organization_members の RLS）で確認してから渡すこと。
 */
export async function fetchMemberPrivateFields(
  userIds: ReadonlyArray<string>,
): Promise<Map<string, MemberPrivateFields>> {
  const fields = new Map<string, MemberPrivateFields>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return fields;

  const { data, error } = await createAdminClient()
    .from("users")
    .select("id, email, password_set_at")
    .in("id", ids);
  if (error) {
    console.error("[fetchMemberPrivateFields] select failed", error);
    return fields;
  }
  for (const row of data ?? []) {
    fields.set(row.id, { email: row.email, passwordSetAt: row.password_set_at });
  }
  return fields;
}
