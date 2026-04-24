import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/job-search/favorite-button";
import { BackButton } from "@/components/job-search/back-button";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatDate } from "@/lib/utils/format-date";

interface PageProps {
  params: Promise<{ id: string }>;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="bg-primary/[0.08] px-4 py-2 rounded-t-[8px]">
      <span className="text-body-sm font-medium">{label}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <div className="bg-primary/[0.08] px-4 py-2">
        <span className="text-body-sm font-medium">{label}</span>
      </div>
      <div className="px-4 py-2">
        <span className="text-body-sm">{value}</span>
      </div>
    </>
  );
}

export default async function ContractorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Self-access guard: 自分自身の詳細ページは表示しない（受注/発注の対象として無意味）
  if (id === user.id) notFound();

  // Fetch contractor user data
  // - role が 'contractor' または 'client' のユーザーのみ表示（staff/admin は除外）
  const { data: contractor } = await supabase
    .from("users")
    .select(
      `
      id, avatar_url, last_name, first_name, birth_date,
      deleted_at, role, identity_verified, ccus_verified, bio,
      prefecture, gender, skill_tags
    `,
    )
    .eq("id", id)
    .in("role", ["contractor", "client"])
    .single();

  if (!contractor) notFound();

  const isDeleted = !!contractor.deleted_at;
  const displayName = getUserDisplayName({
    lastName: contractor.last_name,
    firstName: contractor.first_name,
    deletedAt: contractor.deleted_at,
  });
  const age = contractor.birth_date
    ? calculateAge(contractor.birth_date)
    : null;

  // Fetch related data
  const [
    { data: skills },
    { data: areas },
    { data: qualifications },
    { data: schedules },
    { data: reviews },
    { data: favorite },
  ] = await Promise.all([
    supabase
      .from("user_skills")
      .select("trade_type, experience_years")
      .eq("user_id", id),
    supabase
      .from("user_available_areas")
      .select("prefecture")
      .eq("user_id", id),
    supabase
      .from("user_qualifications")
      .select("qualification_name")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("available_schedules")
      .select("start_date, end_date, note")
      .eq("user_id", id)
      .order("start_date", { ascending: true }),
    supabase
      .from("user_reviews")
      .select("id, rating_again")
      .eq("reviewee_id", id),
    supabase
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", "user")
      .eq("target_id", id)
      .maybeSingle(),
  ]);

  const reviewCount = reviews?.length ?? 0;
  const againCount = (reviews ?? []).filter((r) => r.rating_again === "yes" || r.rating_again === "true").length;

  return (
    <div className="min-h-dvh bg-muted">
      {/* Page title */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-center text-heading-lg font-bold text-secondary">ユーザー詳細</h1>
      </div>

      {/* Profile header */}
      <div className="px-5 flex items-center gap-4">
        <div className="w-[90px] h-[90px] shrink-0 rounded-full bg-background overflow-hidden">
          {contractor.avatar_url && !isDeleted ? (
            <img
              src={contractor.avatar_url}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="w-10 h-10 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold text-foreground">
            {displayName}
            {age !== null && !isDeleted && (
              <span className="ml-1">（{age}歳）</span>
            )}
          </h2>
        </div>
      </div>

      {/* Badges */}
      {!isDeleted && (contractor.identity_verified || contractor.ccus_verified) && (
        <div className="px-5 mt-2 flex items-center gap-3">
          {contractor.identity_verified && (
            <span className="flex items-center gap-1 text-body-sm">
              <img src="/images/icons/icon-tag.png" alt="" className="w-4 h-4" />
              本人確認済み
            </span>
          )}
          {contractor.ccus_verified && (
            <span className="flex items-center gap-1 text-body-sm">
              <img src="/images/icons/icon-tag.png" alt="" className="w-4 h-4" />
              CCUS登録済み
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isDeleted && (
        <div className="px-5 mt-4 flex items-center gap-3">
          <FavoriteButton
            targetType="user"
            targetId={id}
            initialIsFavorited={!!favorite}
            showLabel
          />
          <Button
            variant="outline"
            className="flex-1 rounded-[47px] border-secondary text-secondary font-bold text-[13px]"
            asChild
          >
            <Link href={`/messages/new?to=${id}`}>メッセージを送る</Link>
          </Button>
          <Button
            className="flex-1 rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-[13px]"
            asChild
          >
            <Link href={`/messages/scout-send?userId=${id}`}>スカウトを送る</Link>
          </Button>
        </div>
      )}

      {isDeleted && (
        <div className="mx-5 mt-4 rounded-[8px] bg-background border border-border/10 p-4">
          <p className="text-body-md text-muted-foreground">
            このユーザーは退会済みです。
          </p>
        </div>
      )}

      {/* 基本情報 */}
      <section className="mx-5 mt-6">
        <h3 className="text-[15px] font-bold tracking-wider mb-2">基本情報</h3>
        <div className="rounded-[8px] border border-border/10 bg-background overflow-hidden">
          <InfoRow label="居住地" value={contractor.prefecture} />
          <InfoRow label="性別" value={contractor.gender} />
          <InfoRow
            label="対応可能エリア"
            value={areas && areas.length > 0 ? areas.map((a) => a.prefecture).join("、") : null}
          />
        </div>
      </section>

      {/* 自己紹介 */}
      {contractor.bio && !isDeleted && (
        <section className="mx-5 mt-6">
          <h3 className="text-[15px] font-bold tracking-wider mb-2">自己紹介</h3>
          <div className="rounded-[8px] border border-border/10 bg-background p-4">
            <p className="text-[13px] leading-[180%]">{contractor.bio}</p>
          </div>
        </section>
      )}

      {/* 能力 */}
      {(() => {
        const skillTagList = (contractor.skill_tags ?? []) as string[];
        const hasSkills = skills && skills.length > 0;
        const hasSkillTags = skillTagList.length > 0;
        const hasQualifications = qualifications && qualifications.length > 0;
        if (!hasSkills && !hasSkillTags && !hasQualifications) return null;
        return (
          <section className="mx-5 mt-6">
            <h3 className="text-[15px] font-bold tracking-wider mb-2">能力</h3>
            <div className="rounded-[8px] border border-border/10 bg-background overflow-hidden">
              {hasSkills && (
                <>
                  <InfoRow
                    label="対応できる職種"
                    value={skills!.map((s) => s.trade_type).join("、")}
                  />
                  <InfoRow
                    label="経験年数"
                    value={skills!
                      .filter((s) => s.experience_years)
                      .map((s) => `${s.trade_type} ${s.experience_years}年`)
                      .join("、") || null}
                  />
                </>
              )}
              {hasSkillTags && (
                <InfoRow label="保有スキル" value={skillTagList.join("、")} />
              )}
              {hasQualifications && (
                <InfoRow
                  label="保有資格"
                  value={qualifications!
                    .map((q) => q.qualification_name)
                    .join("、")}
                />
              )}
            </div>
          </section>
        );
      })()}

      {/* 空き日程 & 発注者評価 — PC では横並び */}
      {((schedules && schedules.length > 0) || reviewCount > 0) && (
        <div className="mx-5 mt-6 flex flex-col md:flex-row md:gap-6">
          {/* 空き日程 */}
          {schedules && schedules.length > 0 && (
            <section className="flex-1 min-w-0">
              <h3 className="text-[15px] font-bold tracking-wider mb-2">空き日程</h3>
              <div className="rounded-[8px] border border-border/10 bg-background overflow-hidden">
                <table className="w-full border-collapse">
                  <tbody>
                    {schedules.map((s, i) => (
                      <tr key={i} className="border-b border-primary/20 last:border-b-0">
                        <td className="py-2 px-3 text-body-sm">
                          {formatDate(s.start_date)}〜{formatDate(s.end_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 発注者評価 */}
          {reviewCount > 0 && (
            <section className="flex-1 min-w-0 mt-6 md:mt-0">
              <h3 className="text-[15px] font-bold tracking-wider mb-2">発注者評価</h3>
              <div className="rounded-[8px] border border-border/10 bg-primary/[0.06] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-bold">また依頼したい</p>
                  <Link
                    href={`/users/${id}/reviews`}
                    className="text-[10px] text-foreground/60 flex items-center gap-1"
                  >
                    詳しく見る
                    <span className="text-[10px]">▶</span>
                  </Link>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-[24px] font-bold text-secondary">{againCount}</span>
                  <span className="text-[14px] font-bold mb-0.5">/ {reviewCount}件</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 rounded-full border border-border/10 h-8 overflow-hidden bg-background">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: reviewCount > 0 ? `${(againCount / reviewCount) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Bottom action buttons */}
      {!isDeleted && (
        <div className="mx-5 mt-8 flex items-center gap-3">
          <Button
            variant="outline"
            className="flex-1 rounded-[47px] border-secondary text-secondary font-bold text-[13px]"
            asChild
          >
            <Link href={`/messages/new?to=${id}`}>メッセージを送る</Link>
          </Button>
          <Button
            className="flex-1 rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-[13px]"
            asChild
          >
            <Link href={`/messages/scout-send?userId=${id}`}>スカウトを送る</Link>
          </Button>
        </div>
      )}

      {/* Back link */}
      <div className="mx-5 mb-8">
        <BackButton />
      </div>
    </div>
  );
}
