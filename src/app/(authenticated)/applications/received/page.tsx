import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge } from "@/components/shared/application-status-badge";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/shared/back-button";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatDate } from "@/lib/utils/format-date";

const ITEMS_PER_PAGE = 20;

interface Props {
  searchParams: Promise<{ page?: string; jobId?: string; sort?: string }>;
}

export default async function ReceivedApplicationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const currentPage = Number(params.page) || 1;
  const sortAsc = params.sort === "asc";
  const from = (currentPage - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;

  // Build query: get applications for jobs owned by this user.
  // REQ-MT-004: この画面は未対応の応募（status = 'applied'）のみを表示する
  // インボックス。判断済みの応募は CLI-010（発注履歴一覧）側の役割。
  let countQuery = supabase
    .from("applications")
    .select("*, jobs!inner(owner_id)", { count: "exact", head: true })
    .eq("jobs.owner_id", user.id)
    .eq("status", "applied");

  let dataQuery = supabase
    .from("applications")
    .select(
      `id, status, created_at, scout_message_id,
       applicant:users!applications_applicant_id_fkey(id, last_name, first_name, avatar_url, deleted_at, identity_verified, ccus_verified),
       jobs!inner(id, title, owner_id, trade_type, recruit_end_date, headcount)`,
    )
    .eq("jobs.owner_id", user.id)
    .eq("status", "applied")
    .order("created_at", { ascending: sortAsc })
    .range(from, to);

  // Optional job filter
  if (params.jobId) {
    countQuery = countQuery.eq("job_id", params.jobId);
    dataQuery = dataQuery.eq("job_id", params.jobId);
  }

  const [{ count: totalCount }, { data: applications }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  // Fetch user skills + available areas for applicants
  const applicantIds = applications
    ?.map((a) => {
      const applicant = a.applicant as { id: string } | null;
      return applicant?.id;
    })
    .filter(Boolean) as string[] ?? [];

  const [{ data: allSkills }, { data: allAreas }] = applicantIds.length > 0
    ? await Promise.all([
        supabase
          .from("user_skills")
          .select("user_id, trade_type, experience_years")
          .in("user_id", applicantIds),
        supabase
          .from("user_available_areas")
          .select("user_id, prefecture")
          .in("user_id", applicantIds),
      ])
    : [{ data: [] }, { data: [] }];

  const skillsByUser = new Map<string, typeof allSkills>();
  allSkills?.forEach((s) => {
    const existing = skillsByUser.get(s.user_id) ?? [];
    existing.push(s);
    skillsByUser.set(s.user_id, existing);
  });

  const areasByUser = new Map<string, string[]>();
  allAreas?.forEach((a) => {
    const existing = areasByUser.get(a.user_id) ?? [];
    existing.push(a.prefecture);
    areasByUser.set(a.user_id, existing);
  });

  // Build sort toggle URL
  const nextSort = sortAsc ? "desc" : "asc";
  const sortHref = `?sort=${nextSort}${params.jobId ? `&jobId=${params.jobId}` : ""}`;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">応募一覧</h1>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          全{totalCount ?? 0}件
        </p>
        <Link href={sortHref}>
          <img src="/images/icons/icon-sort.png" alt="並び替え" className="size-5" />
        </Link>
      </div>

      {(!applications || applications.length === 0) && (
        <p className="mt-8 text-center text-body-md text-muted-foreground">
          未対応の応募はありません
        </p>
      )}

      <div className="mx-auto mt-4 max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {applications?.map((app) => {
          const applicant = app.applicant as {
            id: string;
            last_name: string | null;
            first_name: string | null;
            avatar_url: string | null;
            deleted_at: string | null;
            identity_verified: boolean | null;
            ccus_verified: boolean | null;
          } | null;

          const job = app.jobs as {
            id: string;
            title: string;
            trade_type: string | null;
            recruit_end_date: string | null;
            headcount: number | null;
          } | null;

          const name = applicant
            ? getUserDisplayName({
                lastName: applicant.last_name,
                firstName: applicant.first_name,
                deletedAt: applicant.deleted_at,
              })
            : "不明";

          const skills = applicant ? skillsByUser.get(applicant.id) : undefined;
          const skillNames = skills?.map((s) => s.trade_type).join("、") ?? "";
          const maxExp = skills?.reduce(
            (max, s) => (s.experience_years && s.experience_years > max ? s.experience_years : max),
            0,
          ) ?? 0;
          const areas = applicant ? areasByUser.get(applicant.id) : undefined;

          return (
            <Card key={app.id} className="rounded-[8px]">
              <CardContent className="p-4">
                {/* Status badge at top-left */}
                <div className="mb-3 flex items-center gap-2">
                  <ApplicationStatusBadge status={app.status} />
                  {app.scout_message_id && (
                    <span className="rounded-full bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-xs text-primary/70">
                      スカウト経由
                    </span>
                  )}
                </div>

                {/* Applicant profile */}
                <div className="flex items-start gap-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-full bg-muted">
                    {applicant?.avatar_url ? (
                      <img
                        src={applicant.avatar_url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <img src="/images/icons/icon-avatar.png" alt="" className="size-6 opacity-50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-lg font-bold text-foreground">{name}</p>
                    {skills && skills.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {skills.map((s) => (
                          <span
                            key={s.trade_type}
                            className="rounded-[33px] bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-body-xs text-primary"
                          >
                            {s.trade_type}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-2">
                      {applicant?.identity_verified && (
                        <span className="flex items-center gap-0.5 text-body-xs text-muted-foreground">
                          <img src="/images/icons/icon-tag.png" alt="" className="size-3" />
                          本人確認済み
                        </span>
                      )}
                      {applicant?.ccus_verified && (
                        <span className="flex items-center gap-0.5 text-body-xs text-muted-foreground">
                          <img src="/images/icons/icon-tag.png" alt="" className="size-3" />
                          CCUS登録済み
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Area + Experience with icons */}
                <div className="mt-2 space-y-1 text-body-sm text-foreground">
                  {areas && areas.length > 0 && (
                    <div className="flex items-start gap-2">
                      <img src="/images/icons/icon-globe.png" alt="" className="size-4 mt-0.5 shrink-0" />
                      <span className="min-w-[7rem] shrink-0">対応可能エリア</span>
                      <span>{areas.join("、")}</span>
                    </div>
                  )}
                  {maxExp > 0 && (
                    <div className="flex items-start gap-2">
                      <img src="/images/icons/icon-briefcase.png" alt="" className="size-4 mt-0.5 shrink-0" />
                      <span className="min-w-[7rem] shrink-0">経験年数</span>
                      <span>{maxExp}年</span>
                    </div>
                  )}
                </div>

                {/* Job info card */}
                <p className="mt-3 text-body-xs text-muted-foreground">
                  このユーザーから以下の案件に応募があります
                </p>

                <div className="mt-2 rounded-[8px] border border-border p-3">
                  <p className="text-body-md font-bold text-foreground">
                    {job?.title ?? "不明"}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-body-xs text-muted-foreground">
                    <span>{job?.trade_type ?? ""}{job?.headcount ? `・${job.headcount}人` : ""}</span>
                    <span>
                      締め切り: {formatDate(job?.recruit_end_date, "未定")}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <Button size="sm" className="rounded-pill" asChild>
                    <Link href={`/applications/received/${app.id}`}>
                      応募詳細をみる
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalCount !== null && totalCount > ITEMS_PER_PAGE && (
        <PaginationControls totalCount={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
      )}

      <div className="mt-6">
        <BackButton />
      </div>
    </div>
  );
}
