// ---------------------------------------------------------------------------
// 求人へのお問い合わせ アクセスガード用の組織 ID 解決ヘルパー
// ---------------------------------------------------------------------------
// CON-006 ボタン表示判定（page）と submitJobInquiryAction の双方が同じ解決ロジックを
// 使うことで、canSendJobInquiry に渡す値の食い違いを防ぐ。
// organization_members の RLS（is_same_org）で他者の所属は SELECT できないため、
// admin client（service role）で解決する。

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

/**
 * viewer（閲覧者・送信者）が所属する組織 ID を解決する。
 * 法人プランの owner も organization_members に owner として載るためまず membership を見る。
 * 万一 membership に無い owner でも organizations.owner_id で拾えるようフォールバックする。
 * 無所属（個人受注者・個人発注者）は null。
 */
export async function resolveViewerOrganizationId(
  admin: AdminClient,
  viewerId: string,
): Promise<string | null> {
  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", viewerId)
    .maybeSingle();
  if (membership?.organization_id) {
    return membership.organization_id;
  }

  const { data: owned } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", viewerId)
    .is("deleted_at", null)
    .maybeSingle();
  return owned?.id ?? null;
}

/**
 * 宛先 client が owner として保有する組織 ID を解決する（denormalize 保存にも使う）。
 * 個人プランの発注者は組織を持たないため null。
 */
export async function resolveTargetOrganizationId(
  admin: AdminClient,
  targetClientId: string,
): Promise<string | null> {
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", targetClientId)
    .is("deleted_at", null)
    .maybeSingle();
  return org?.id ?? null;
}
