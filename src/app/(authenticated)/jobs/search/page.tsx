import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { JobListCard } from "@/components/job-search/job-list-card";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/job-search/back-button";
import { JobSearchFilter } from "./job-search-filter";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobSearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * ITEMS_PER_PAGE;
  const q = (sp.q as string) ?? "";
  const prefecture = (sp.prefecture as string) ?? "";
  const tradeType = (sp.tradeType as string) ?? "";
  const sort = (sp.sort as string) ?? "newest";

  // Build query
  let query = supabase
    .from("jobs")
    .select(
      `
      id, title, description, trade_type, prefecture,
      reward_lower, reward_upper, is_urgent,
      recruit_start_date, recruit_end_date, created_at,
      users!jobs_owner_id_fkey(company_name),
      job_images(image_url, sort_order)
    `,
      { count: "exact" },
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .gte("recruit_end_date", new Date().toISOString().split("T")[0]);

  // Apply filters
  if (q) {
    // Find owner_ids matching company_name keyword
    const { data: matchingOwners } = await supabase
      .from("users")
      .select("id")
      .ilike("company_name", `%${q}%`);

    const ownerIds = (matchingOwners ?? []).map((o) => o.id);

    if (ownerIds.length > 0) {
      query = query.or(
        `title.ilike.%${q}%,description.ilike.%${q}%,owner_id.in.(${ownerIds.join(",")})`,
      );
    } else {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }
  }
  if (prefecture) {
    query = query.eq("prefecture", prefecture);
  }
  if (tradeType) {
    query = query.eq("trade_type", tradeType);
  }

  // Apply sort
  if (sort === "reward_high") {
    query = query.order("reward_upper", { ascending: false, nullsFirst: false });
  } else if (sort === "reward_low") {
    query = query.order("reward_lower", { ascending: true, nullsFirst: false });
  } else {
    // Default: urgent first, then newest
    query = query
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data: jobs, count } = await query;

  // Get user's favorites for these jobs
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: favorites } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", user.id)
    .eq("target_type", "job")
    .in("target_id", jobIds.length > 0 ? jobIds : ["__none__"]);

  const favoritedIds = new Set((favorites ?? []).map((f) => f.target_id));

  return (
    <div className="min-h-dvh bg-muted">
      {/* Header */}
      <div className="bg-background px-6 py-4 md:px-12">
        <h1 className="text-heading-lg font-bold text-secondary">
          募集案件一覧
        </h1>
      </div>

      <div className="px-6 md:px-12">
        {/* Count + Sort + Search */}
        <div className="flex items-center justify-between py-4">
          <p className="text-body-sm text-muted-foreground">
            全{count ?? 0}件
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/jobs/search?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][],
                ),
                sort: sort === "newest" ? "reward_high" : sort === "reward_high" ? "reward_low" : "newest",
              }).toString()}`}
              className="flex items-center gap-1 text-body-sm text-foreground"
            >
              <img
                src="/images/icons/icon-sort.png"
                alt="ソート"
                className="w-5 h-5"
              />
              <span>
                {sort === "reward_high"
                  ? "報酬高い順"
                  : sort === "reward_low"
                    ? "報酬低い順"
                    : "新着順"}
              </span>
            </Link>
            <JobSearchFilter />
          </div>
        </div>

        {/* Job cards grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
          {(jobs ?? []).map((job) => {
            const companyName =
              (job.users as unknown as { company_name: string | null })
                ?.company_name ?? null;
            const images = (job.job_images as Array<{
              image_url: string;
              sort_order: number;
            }>) ?? [];
            const thumbnail =
              images.sort((a, b) => a.sort_order - b.sort_order)[0]
                ?.image_url ?? null;

            return (
              <JobListCard
                key={job.id}
                job={{
                  id: job.id,
                  title: job.title,
                  tradeType: job.trade_type ?? "",
                  prefecture: job.prefecture ?? "",
                  rewardLower: job.reward_lower,
                  rewardUpper: job.reward_upper,
                  isUrgent: job.is_urgent ?? false,
                  recruitEndDate: job.recruit_end_date ?? "",
                  companyName,
                  thumbnailUrl: thumbnail,
                }}
                isFavorited={favoritedIds.has(job.id)}
              />
            );
          })}
        </div>

        {(jobs ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-body-md text-muted-foreground">
              条件に一致する案件が見つかりませんでした。
            </p>
          </div>
        )}

        {/* Pagination */}
        <PaginationControls totalCount={count ?? 0} itemsPerPage={ITEMS_PER_PAGE} />

        <BackButton />
      </div>
    </div>
  );
}
