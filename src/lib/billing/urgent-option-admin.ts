import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * ADM-009 ユーザー詳細の「銀行振込」枠 → 「急募オプション」の段で使う取得ロジック。
 *
 * - 適用中の急募（カード・銀行振込の両方）を案件名 + 期限で並べる（表示専用）
 * - 急募を付けられる案件 = その会員（法人なら組織全体）の掲載中（open）で、まだ急募になっていない案件。
 *   料金プラン画面（/billing）の急募プルダウンと同じ絞り込み。担当者（staff）が作った案件も
 *   組織の案件として含める（「会員本人の案件だけ」に絞ると担当者作成の案件が選べなくなる）
 *
 * Server Action（activateBankTransferUrgentOptionAction）は同じ関数で選ばれた案件を検証し、
 * 画面のプルダウンと許可範囲を一致させる。
 */

type AdminClient = SupabaseClient<Database>;

export interface ActiveUrgentOptionRow {
  id: string;
  jobId: string | null;
  jobTitle: string;
  /** ISO。急募は必ず end_date を持つが、型上は null を許容 */
  endDate: string | null;
  paymentMethod: "stripe" | "bank_transfer";
}

export interface UrgentEligibleJob {
  id: string;
  title: string;
}

export async function fetchActiveUrgentOptions(
  admin: AdminClient,
  userId: string,
): Promise<ActiveUrgentOptionRow[]> {
  const { data } = await admin
    .from("option_subscriptions")
    .select("id, job_id, end_date, payment_method, jobs(title)")
    .eq("user_id", userId)
    .eq("option_type", "urgent")
    .eq("status", "active")
    .order("end_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    jobId: r.job_id,
    jobTitle: r.jobs?.title ?? "（案件不明）",
    endDate: r.end_date,
    paymentMethod: r.payment_method,
  }));
}

/** 会員が所属する（解散していない）組織 ID。無ければ null */
async function resolveOrganizationId(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("organization_members")
    .select("organization_id, organizations!inner(deleted_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  for (const row of data ?? []) {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (org && !org.deleted_at) return row.organization_id;
  }
  return null;
}

export async function fetchUrgentEligibleJobs(
  admin: AdminClient,
  userId: string,
): Promise<UrgentEligibleJob[]> {
  const organizationId = await resolveOrganizationId(admin, userId);

  let query = admin
    .from("jobs")
    .select("id, title, is_urgent")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  query = organizationId
    ? query.or(`owner_id.eq.${userId},organization_id.eq.${organizationId}`)
    : query.eq("owner_id", userId);
  const { data: jobs } = await query;
  const candidates = (jobs ?? []).filter((j) => !j.is_urgent);
  if (candidates.length === 0) return [];

  // is_urgent が false でも active な急募行が残っていれば対象外（/billing と同じ二重防御）
  const { data: activeRows } = await admin
    .from("option_subscriptions")
    .select("job_id")
    .eq("option_type", "urgent")
    .eq("status", "active")
    .in(
      "job_id",
      candidates.map((j) => j.id),
    );
  const urgentJobIds = new Set((activeRows ?? []).map((r) => r.job_id));

  return candidates
    .filter((j) => !urgentJobIds.has(j.id))
    .map((j) => ({ id: j.id, title: j.title }));
}
