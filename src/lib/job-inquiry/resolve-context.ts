// ---------------------------------------------------------------------------
// 求人へのお問い合わせ アクセスガード用の組織 ID 解決ヘルパー
// ---------------------------------------------------------------------------
// CON-006 ボタン表示判定（page）と submitJobInquiryAction の双方が同じ解決ロジックを
// 使うことで、canSendJobInquiry に渡す値の食い違いを防ぐ。

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;
type SupabaseServerClient = SupabaseClient<Database>;

/**
 * viewer（閲覧者・送信者＝認証ユーザー）が所属する active 組織 ID を解決する。
 *
 * proxy-account-multi-org-support: N 組織兼任ユーザーで .maybeSingle() が
 * 「Cannot coerce to single JSON object」で爆死するパターンを避けるため、
 * `getActiveOrganizationContext`（Cookie で active org を解決する共通ヘルパー）
 * を経由する。
 *
 * `admin` 引数は organizations フォールバック検索（旧データ救済）にのみ使用する。
 */
export async function resolveViewerOrganizationId(
  admin: AdminClient,
  viewerId: string,
  supabase?: SupabaseServerClient,
): Promise<string | null> {
  if (supabase) {
    const { active } = await getActiveOrganizationContext(supabase);
    if (active) {
      return active.organizationId;
    }
  } else {
    // フォールバック: supabase 引数が渡されない呼び出し（後方互換）。
    // admin client で全 membership を取得し最古のものを返す（getActiveOrganizationContext と同じ既定）。
    const { data: memberships } = await admin
      .from("organization_members")
      .select("organization_id, created_at, organizations!inner(deleted_at)")
      .eq("user_id", viewerId)
      .order("created_at", { ascending: true });
    const firstActive = (memberships ?? []).find((m) => {
      const org = Array.isArray(m.organizations)
        ? m.organizations[0]
        : m.organizations;
      return org && !(org as { deleted_at: string | null }).deleted_at;
    });
    if (firstActive?.organization_id) {
      return firstActive.organization_id;
    }
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
