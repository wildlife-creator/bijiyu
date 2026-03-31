import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { BackButton } from "@/components/job-search/back-button";
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
        employee_scale, message
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

  // Fetch client's open jobs
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, trade_type, prefecture, reward_lower, reward_upper")
    .eq("owner_id", id)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch client reviews count
  const { data: reviews } = await supabase
    .from("client_reviews")
    .select("id, rating_again")
    .eq("reviewee_id", id);

  const reviewCount = reviews?.length ?? 0;

  // Check favorite status
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

      {/* Review count */}
      {reviewCount > 0 && (
        <div className="mt-3">
          <span className="text-body-sm text-muted-foreground">
            レビュー {reviewCount}件
          </span>
        </div>
      )}

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
      {jobs && jobs.length > 0 && (
        <section className="mt-6">
          <h3 className="text-body-lg font-bold text-foreground">
            掲載中の案件
          </h3>
          <div className="mt-2 space-y-3">
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <Card className="rounded-[8px] transition-colors hover:bg-muted/50">
                  <CardContent className="p-4">
                    <h4 className="text-body-md font-semibold line-clamp-2">
                      {job.title}
                    </h4>
                    <div className="mt-1 flex items-center gap-3 text-body-sm text-muted-foreground">
                      {job.trade_type && (
                        <span className="flex items-center gap-1">
                          <img
                            src="/images/icons/icon-briefcase.png"
                            alt=""
                            className="w-4 h-4"
                          />
                          {job.trade_type}
                        </span>
                      )}
                      {job.prefecture && (
                        <span className="flex items-center gap-1">
                          <img
                            src="/images/icons/icon-pin.png"
                            alt=""
                            className="w-4 h-4"
                          />
                          {job.prefecture}
                        </span>
                      )}
                    </div>
                    {(job.reward_lower || job.reward_upper) && (
                      <p className="mt-1 text-body-sm font-semibold">
                        {job.reward_lower?.toLocaleString()}
                        {job.reward_lower && job.reward_upper && "〜"}
                        {job.reward_upper?.toLocaleString()}円（人工）
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <BackButton />
    </div>
  );
}
