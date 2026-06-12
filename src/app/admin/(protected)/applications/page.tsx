import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ADMIN_APPLICATION_CATEGORY_LABELS,
  applyCategoryFilter,
  classifyAdminApplication,
  type AdminApplicationCategory,
} from "@/lib/admin/application-status";
import {
  buildApplicationsKeywordOr,
  KEYWORD_ID_SET_LIMIT,
} from "@/lib/admin/applications-list";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { formatDate, getJstToday } from "@/lib/utils/format-date";
import {
  getUserDisplayName,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { AdminApplicationFilters } from "./filters";

const PAGE_SIZE = 20;

const VALID_CATEGORIES = Object.keys(
  ADMIN_APPLICATION_CATEGORY_LABELS,
) as AdminApplicationCategory[];

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    sort?: string;
    page?: string;
    jobId?: string;
    clientId?: string;
  }>;
}

/**
 * ADM-013: 応募履歴一覧。
 * デザインカンプ: design-assets/screens/ADM-013.png（CSV出力ボタンはスコープ外で置かない）
 *
 * - キーワードは applicant id 集合 / job id 集合（タイトル＋発注者表示名→job）に
 *   展開して .or() で OR 結合（空でない枝のみ。全集合が空なら0件）
 * - ステータス絞込は admin 専用8分類（applyCategoryFilter・全条件サーバー側）
 * - ドリルダウン: ?jobId=（ADM-022 から）／?clientId=（ADM-004 から・会社単位）
 */
export default async function AdminApplicationsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const category = VALID_CATEGORIES.includes(
    sp.category as AdminApplicationCategory,
  )
    ? (sp.category as AdminApplicationCategory)
    : null;
  const sort = ["applied_desc", "applied_asc", "fwd_asc", "fwd_desc"].includes(
    sp.sort ?? "",
  )
    ? sp.sort!
    : "applied_desc";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const jobIdParam = sp.jobId ?? null;
  const clientIdParam = sp.clientId ?? null;
  const today = getJstToday();

  const admin = createAdminClient();

  // ドリルダウンのヘッダー表示（案件名 / 会社名）
  let drilldownLabel: string | null = null;
  if (jobIdParam) {
    const { data: job } = await admin
      .from("jobs")
      .select("title")
      .eq("id", jobIdParam)
      .maybeSingle();
    drilldownLabel = job ? `案件: ${job.title}` : null;
  } else if (clientIdParam) {
    const [{ data: clientUser }, { data: profile }] = await Promise.all([
      admin
        .from("users")
        .select("last_name, first_name, deleted_at")
        .eq("id", clientIdParam)
        .maybeSingle(),
      admin
        .from("client_profiles")
        .select("display_name")
        .eq("user_id", clientIdParam)
        .maybeSingle(),
    ]);
    if (clientUser) {
      drilldownLabel = `会社: ${resolveParticipantName({
        displayName: profile?.display_name ?? null,
        lastName: clientUser.last_name,
        firstName: clientUser.first_name,
        deletedAt: clientUser.deleted_at,
      })}`;
    }
  }

  // clientId ドリルダウン: 会社スコープの job id 集合（org 有無で経路切替）
  let clientJobIds: string[] | null = null;
  if (clientIdParam) {
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", clientIdParam)
      .maybeSingle();
    let jobsQuery = admin.from("jobs").select("id").limit(KEYWORD_ID_SET_LIMIT);
    jobsQuery = org
      ? jobsQuery.eq("organization_id", org.id)
      : jobsQuery.eq("owner_id", clientIdParam);
    const { data: jobRows } = await jobsQuery;
    clientJobIds = (jobRows ?? []).map((j) => j.id);
  }

  // キーワード → applicant id 集合 + job id 集合
  let keywordOr: string | null = null;
  let idSetTruncated = false;
  if (keyword) {
    const [{ data: userRows }, { data: jobRows }, { data: profileRows }] =
      await Promise.all([
        admin
          .from("users")
          .select("id")
          .or(
            `last_name.ilike.%${keyword}%,first_name.ilike.%${keyword}%,email.ilike.%${keyword}%`,
          )
          .limit(KEYWORD_ID_SET_LIMIT),
        admin
          .from("jobs")
          .select("id")
          .ilike("title", `%${keyword}%`)
          .limit(KEYWORD_ID_SET_LIMIT),
        admin
          .from("client_profiles")
          .select("user_id")
          .ilike("display_name", `%${keyword}%`)
          .limit(KEYWORD_ID_SET_LIMIT),
      ]);

    const applicantIds = (userRows ?? []).map((u) => u.id);
    const jobIds = (jobRows ?? []).map((j) => j.id);

    // 発注者表示名ヒット → owner →（org の場合 organization_id 経由で）job id 集合
    const ownerIds = (profileRows ?? []).map((p) => p.user_id);
    if (ownerIds.length > 0) {
      const { data: orgRows } = await admin
        .from("organizations")
        .select("id")
        .in("owner_id", ownerIds);
      const orgIds = (orgRows ?? []).map((o) => o.id);
      const ownerJobBranches: string[] = [
        `owner_id.in.(${ownerIds.join(",")})`,
      ];
      if (orgIds.length > 0) {
        ownerJobBranches.push(`organization_id.in.(${orgIds.join(",")})`);
      }
      const { data: ownerJobRows } = await admin
        .from("jobs")
        .select("id")
        .or(ownerJobBranches.join(","))
        .limit(KEYWORD_ID_SET_LIMIT);
      jobIds.push(...(ownerJobRows ?? []).map((j) => j.id));
    }

    idSetTruncated =
      applicantIds.length >= KEYWORD_ID_SET_LIMIT ||
      jobIds.length >= KEYWORD_ID_SET_LIMIT;
    keywordOr = buildApplicationsKeywordOr({ applicantIds, jobIds });
  }

  // クエリ発行判定: キーワードが全集合空 or 会社に案件なし → 0件
  const skipQuery =
    (keyword !== "" && keywordOr === null) ||
    (clientJobIds !== null && clientJobIds.length === 0);

  let applications: Array<{
    id: string;
    status: string;
    first_work_date: string | null;
    cancelled_by: string | null;
    created_at: string;
    job: { title: string } | null;
    applicant: {
      last_name: string | null;
      first_name: string | null;
      email: string;
      birth_date: string | null;
      deleted_at: string | null;
    } | null;
  }> = [];
  let total = 0;

  if (!skipQuery) {
    let query = admin
      .from("applications")
      .select(
        `id, status, first_work_date, cancelled_by, created_at,
         job:jobs(title),
         applicant:users!applicant_id(last_name, first_name, email, birth_date, deleted_at)`,
        { count: "exact" },
      );

    if (jobIdParam) query = query.eq("job_id", jobIdParam);
    if (clientJobIds !== null) query = query.in("job_id", clientJobIds);
    if (keywordOr) query = query.or(keywordOr);
    if (category) query = applyCategoryFilter(query, category, today);

    if (sort === "fwd_asc" || sort === "fwd_desc") {
      query = query
        .order("first_work_date", {
          ascending: sort === "fwd_asc",
          nullsFirst: false,
        })
        .order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: sort === "applied_asc" });
    }

    const { data, count } = await query.range(offset, offset + PAGE_SIZE - 1);
    applications = (data ?? []) as typeof applications;
    total = count ?? 0;
  }

  const hasPrev = page > 1;
  const hasNext = offset + PAGE_SIZE < total;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (category) params.set("category", category);
    if (sort !== "applied_desc") params.set("sort", sort);
    if (jobIdParam) params.set("jobId", jobIdParam);
    if (clientIdParam) params.set("clientId", clientIdParam);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/admin/applications${params.toString() ? `?${params}` : ""}`;
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        応募履歴一覧
      </h1>

      {drilldownLabel && (
        <p className="mt-4 rounded-[8px] bg-primary/10 px-4 py-2 text-body-md font-medium text-foreground">
          {drilldownLabel} で絞り込み中
        </p>
      )}

      <AdminApplicationFilters
        initialKeyword={keyword}
        initialCategory={category ?? "all"}
        initialSort={sort}
        jobId={jobIdParam ?? undefined}
        clientId={clientIdParam ?? undefined}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{total}件</p>
      {idSetTruncated && (
        <p className="mt-1 text-body-sm text-destructive">
          ヒット件数が多いため一部のみ検索対象になっています。より具体的なキーワードで検索してください
        </p>
      )}

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {applications.length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当する応募がありません
          </p>
        ) : (
          applications.map((app) => {
            const name = getUserDisplayName({
              lastName: app.applicant?.last_name,
              firstName: app.applicant?.first_name,
              deletedAt: app.applicant?.deleted_at,
            });
            const age = app.applicant?.birth_date
              ? calculateAge(app.applicant.birth_date)
              : null;
            const categoryLabel =
              ADMIN_APPLICATION_CATEGORY_LABELS[
                classifyAdminApplication(
                  {
                    status:
                      app.status as Parameters<
                        typeof classifyAdminApplication
                      >[0]["status"],
                    first_work_date: app.first_work_date,
                    cancelled_by:
                      app.cancelled_by as "contractor" | "admin" | null,
                  },
                  today,
                )
              ];
            return (
              <Link
                key={app.id}
                href={`/admin/applications/${app.id}`}
                className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-md font-medium text-foreground">
                    {name}
                    {age !== null && <span>（{age}歳）</span>}
                  </p>
                  <p className="truncate text-body-sm text-muted-foreground">
                    {app.applicant?.email}
                  </p>
                  <p className="mt-1 truncate text-body-md text-foreground">
                    {app.job?.title ?? "—"}
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    初回稼働日：{formatDate(app.first_work_date)}
                  </p>
                  <span className="mt-1 inline-block rounded-full bg-primary/10 px-3 py-0.5 text-body-xs font-medium text-primary">
                    {categoryLabel}
                  </span>
                </div>
                <span className="text-muted-foreground">›</span>
              </Link>
            );
          })
        )}
      </div>

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex justify-center gap-3">
          {hasPrev && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page - 1)}>＜前の20件</Link>
            </Button>
          )}
          {hasNext && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page + 1)}>次の20件＞</Link>
            </Button>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/dashboard">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
