import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

import { JobListClient } from "./job-list-client";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function JobListPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const currentPage = Math.max(1, Number(params.page) || 1);
  const statusFilter = params.status || "all";
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  // Check if user is in an organization
  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Build query — include first image via nested select
  let query = supabase
    .from("jobs")
    .select("id, title, trade_type, prefecture, reward_lower, reward_upper, recruit_end_date, recruit_start_date, headcount, status, created_at, owner_id, users!owner_id(company_name), job_images(image_url)", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (orgMember) {
    // Corporate plan: show all organization jobs
    query = query.eq("organization_id", orgMember.organization_id);
  } else {
    // Individual: show own jobs only
    query = query.eq("owner_id", user.id);
  }

  if (statusFilter !== "all" && ["draft", "open", "closed"].includes(statusFilter)) {
    query = query.eq("status", statusFilter as "draft" | "open" | "closed");
  }

  const { data: jobs, count } = await query.range(
    offset,
    offset + ITEMS_PER_PAGE - 1
  );

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Map jobs to include thumbnail and company name
  const jobsWithMeta = (jobs ?? []).map((job) => {
    const raw = job as Record<string, unknown>;
    const images = raw.job_images as { image_url: string }[] | null;
    const user = raw.users as { company_name: string | null } | null;
    return {
      id: job.id,
      title: job.title,
      trade_type: job.trade_type,
      prefecture: job.prefecture,
      reward_lower: job.reward_lower,
      reward_upper: job.reward_upper,
      recruit_end_date: job.recruit_end_date,
      recruit_start_date: job.recruit_start_date,
      headcount: job.headcount,
      status: job.status,
      created_at: job.created_at,
      thumbnailUrl: images?.[0]?.image_url ?? null,
      companyName: user?.company_name ?? null,
    };
  });

  return (
    <div className="min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        募集現場一覧
      </h1>

      {/* New job button */}
      <div className="mt-6 flex justify-center">
        <Button
          asChild
          className="rounded-[47px] bg-primary px-8 text-primary-foreground hover:bg-primary/90"
        >
          <Link href="/jobs/create">新規作成</Link>
        </Button>
      </div>

      {/* Filter and count */}
      <JobListClient
        jobs={jobsWithMeta}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
        statusFilter={statusFilter}
      />

      {/* Back button */}
      <div className="mt-8 flex justify-center">
        <Button
          variant="outline"
          size="lg"
          className="w-full max-w-sm rounded-[47px] border-secondary text-secondary"
          asChild
        >
          <Link href="/mypage">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
