import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { BackButton } from "@/components/job-search/back-button";
import { JobListCard } from "@/components/job-search/job-list-card";
import { createClient } from "@/lib/supabase/server";
import { getUserDisplayName } from "@/lib/utils/display-name";

interface PageProps {
  params: Promise<{ id: string }>;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex border-b border-border py-3">
      <span className="w-28 shrink-0 text-body-md font-medium text-secondary">
        {label}
      </span>
      <span className="flex-1 text-body-md text-foreground">{value}</span>
    </div>
  );
}


export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch client user data with profile
  const { data: client } = await supabase
    .from("users")
    .select(
      `
      id, avatar_url, company_name, last_name, first_name,
      deleted_at, role, prefecture,
      client_profiles(
        display_name, recruit_job_types, recruit_area, working_way,
        employee_scale, message, language
      )
    `,
    )
    .eq("id", id)
    .eq("role", "client")
    .single();

  if (!client) notFound();

  const isDeleted = !!client.deleted_at;
  const profile = Array.isArray(client.client_profiles)
    ? client.client_profiles[0]
    : client.client_profiles;

  const displayName = getUserDisplayName(
    {
      lastName: client.last_name,
      firstName: client.first_name,
      companyName: client.company_name,
      deletedAt: client.deleted_at,
    },
    "company",
  );

  // Fetch client's open jobs with thumbnail + urgency info
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `id, title, trade_type, prefecture, reward_lower, reward_upper,
       is_urgent, recruit_end_date,
       owner:users!jobs_owner_id_fkey(company_name),
       job_images(image_url, sort_order)`,
    )
    .eq("owner_id", id)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get job favorites for these jobs
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: jobFavorites } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", user.id)
    .eq("target_type", "job")
    .in("target_id", jobIds.length > 0 ? jobIds : ["__none__"]);

  const favoritedJobIds = new Set(
    (jobFavorites ?? []).map((f) => f.target_id),
  );

  // Check client favorite status
  const { data: favorite } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", "client")
    .eq("target_id", id)
    .maybeSingle();

  return (
    <div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-secondary">発注者詳細</h1>

      {/* Profile header */}
      <div className="mt-4 flex items-center gap-4">
        <div className="w-16 h-16 shrink-0 rounded-full bg-muted overflow-hidden">
          {client.avatar_url && !isDeleted ? (
            <img
              src={client.avatar_url}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="w-8 h-8 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-md font-bold text-foreground truncate">
            {displayName}
          </h2>
          {profile?.display_name && !isDeleted && (
            <p className="text-body-sm text-muted-foreground">
              {profile.display_name}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isDeleted && (
        <div className="mt-4 flex items-center gap-3">
          <FavoriteButton
            targetType="client"
            targetId={id}
            initialIsFavorited={!!favorite}
            showLabel
          />
          <div className="flex-1" />
          <Button
            asChild
            className="rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href={`/messages/new?to=${id}`}>メッセージを送る</Link>
          </Button>
        </div>
      )}

      {isDeleted && (
        <div className="mt-4 rounded-[8px] bg-muted p-4">
          <p className="text-body-md text-muted-foreground">
            このユーザーは退会済みです。
          </p>
        </div>
      )}

      {/* Detail rows */}
      <div className="mt-6">
        <DetailRow label="エリア" value={client.prefecture} />
        <DetailRow
          label="募集職種"
          value={
            profile?.recruit_job_types && profile.recruit_job_types.length > 0
              ? profile.recruit_job_types.join(", ")
              : null
          }
        />
        <DetailRow
          label="募集エリア"
          value={
            profile?.recruit_area && profile.recruit_area.length > 0
              ? profile.recruit_area.join("、")
              : null
          }
        />
        <DetailRow
          label="従業員規模"
          value={profile?.employee_scale ? `${profile.employee_scale}名` : null}
        />
        <DetailRow label="稼働方法" value={profile?.working_way} />
        <DetailRow label="言語" value={profile?.language} />
      </div>

      {/* Message from client */}
      {profile?.message && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">
            発注者メッセージ
          </h3>
          <p className="mt-2 text-body-md text-foreground whitespace-pre-wrap">
            {profile.message}
          </p>
        </section>
      )}

      {/* Open jobs */}
      <section className="mt-6 -mx-4 px-4 py-6 bg-muted md:-mx-8 md:px-8">
        <h3 className="text-body-lg font-bold text-foreground">
          掲載中の案件
        </h3>
        {(!jobs || jobs.length === 0) ? (
          <p className="mt-2 text-body-md text-muted-foreground">
            現在掲載中の案件はありません
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => {
              const images = job.job_images as { image_url: string; sort_order: number }[] | null;
              const thumbnail = images && images.length > 0
                ? [...images].sort((a, b) => a.sort_order - b.sort_order)[0].image_url
                : null;
              const owner = job.owner as { company_name: string | null } | null;

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
                    companyName: owner?.company_name ?? null,
                    thumbnailUrl: thumbnail,
                  }}
                  isFavorited={favoritedJobIds.has(job.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      <BackButton />
    </div>
  );
}
