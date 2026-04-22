import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge, getOrderDisplayCategory } from "@/components/shared/application-status-badge";
import { BackButton } from "@/components/shared/back-button";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatDate } from "@/lib/utils/format-date";
import { calculateAge } from "@/lib/utils/calculate-age";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application } = await supabase
    .from("applications")
    .select(
      `id, status, headcount, working_type, preferred_first_work_date, first_work_date, message, created_at,
       applicant:users!applications_applicant_id_fkey(
         id, last_name, first_name, avatar_url, birth_date, deleted_at,
         identity_verified, ccus_verified, skill_tags
       ),
       jobs!inner(id, title, trade_type, headcount, reward_lower, reward_upper,
                  prefecture, address, work_start_date, work_end_date,
                  recruit_start_date, recruit_end_date, work_hours, owner_id),
       user_reviews(id),
       client_reviews(id)`,
    )
    .eq("id", id)
    .in("status", ["applied", "accepted", "completed", "lost", "cancelled", "rejected"])
    .single();

  if (!application) {
    notFound();
  }

  const job = application.jobs as {
    id: string;
    title: string;
    trade_type: string | null;
    headcount: number | null;
    reward_lower: number | null;
    reward_upper: number | null;
    prefecture: string | null;
    address: string | null;
    work_start_date: string | null;
    work_end_date: string | null;
    recruit_start_date: string | null;
    recruit_end_date: string | null;
    work_hours: string | null;
    owner_id: string;
  };

  if (job.owner_id !== user.id) {
    notFound();
  }

  const applicant = application.applicant as {
    id: string;
    last_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
    birth_date: string | null;
    deleted_at: string | null;
    identity_verified: boolean;
    ccus_verified: boolean;
    skill_tags: string[] | null;
  } | null;

  const contractorName = applicant
    ? getUserDisplayName({
        lastName: applicant.last_name,
        firstName: applicant.first_name,
        deletedAt: applicant.deleted_at,
      })
    : "不明";

  const contractorAge = applicant?.birth_date
    ? calculateAge(applicant.birth_date)
    : null;

  // Fetch applicant's skills, areas, qualifications
  const applicantId = applicant?.id;

  const [skillsResult, areasResult, qualificationsResult] = await Promise.all([
    applicantId
      ? supabase
          .from("user_skills")
          .select("trade_type, experience_years")
          .eq("user_id", applicantId)
      : Promise.resolve({ data: [] }),
    applicantId
      ? supabase
          .from("user_available_areas")
          .select("prefecture")
          .eq("user_id", applicantId)
      : Promise.resolve({ data: [] }),
    applicantId
      ? supabase
          .from("user_qualifications")
          .select("qualification_name")
          .eq("user_id", applicantId)
      : Promise.resolve({ data: [] }),
  ]);

  const skills = skillsResult.data ?? [];
  const areas = areasResult.data ?? [];
  const qualifications = qualificationsResult.data ?? [];
  // 保有スキル（users.skill_tags）。「対応できる職種」（skills）とは別物
  const skillTagList = (applicant?.skill_tags ?? []) as string[];

  // Check if review exists
  const hasUserReview =
    application.user_reviews != null &&
    (!Array.isArray(application.user_reviews) || application.user_reviews.length > 0);

  const rewardText = job.reward_lower
    ? `${job.reward_lower.toLocaleString()}円（人工）`
    : "未定";

  const recruitPeriod =
    job.recruit_start_date && job.recruit_end_date
      ? `${formatDate(job.recruit_start_date)}〜${formatDate(job.recruit_end_date)}`
      : "未定";

  const tradeTypeHeadcount = [
    job.trade_type,
    job.headcount ? `${job.headcount}人` : null,
  ]
    .filter(Boolean)
    .join("・");

  // Max experience years across skills
  const maxExperienceYears = skills.reduce<number | null>((max, s) => {
    if (s.experience_years == null) return max;
    return max == null ? s.experience_years : Math.max(max, s.experience_years);
  }, null);

  return (
    <div className="min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8">
      {/* 1. Header */}
      <h1 className="text-center text-heading-lg font-bold text-secondary">発注内容詳細</h1>

      {/* 2. Status badge */}
      <div className="mt-2">
        <ApplicationStatusBadge
          status={application.status}
          displayCategory={getOrderDisplayCategory(
            application.status,
            hasUserReview,
            application.client_reviews != null &&
              (!Array.isArray(application.client_reviews) || application.client_reviews.length > 0),
          )}
        />
      </div>

      {/* Notice for cancelled/rejected */}
      {(application.status === "cancelled" || application.status === "rejected") && (
        <p className="mt-3 text-body-sm text-red-500">
          {application.status === "rejected"
            ? "この応募はお断りしています。稼働は行われていません。"
            : "この応募は応募者によりキャンセルされました。稼働は行われていません。"}
        </p>
      )}

      {/* 3. 案件情報 section */}
      <div className="mt-4 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">案件情報</h2>
        <p className="text-body-lg font-semibold text-foreground">{job.title}</p>
        {tradeTypeHeadcount && (
          <p className="text-body-sm text-muted-foreground">{tradeTypeHeadcount}</p>
        )}

        <div className="space-y-2 text-body-sm text-foreground">
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-coin.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0 font-semibold">報酬</span>
            <span>{rewardText}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-pin.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0 font-semibold">エリア</span>
            <span>{job.prefecture ?? "未定"}{job.address ? ` ${job.address}` : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-calendar.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0 font-semibold">募集期間</span>
            <span>{recruitPeriod}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
            <span className="min-w-[6rem] shrink-0 font-semibold">稼働時間</span>
            <span>{job.work_hours ?? "未定"}</span>
          </div>
        </div>
      </div>

      {/* 「募集案件詳細」ボタン */}
      <div className="mt-4 flex justify-center">
        <Button className="w-full max-w-xs rounded-full text-white" asChild>
          <Link href={`/jobs/${job.id}`} className="inline-flex items-center justify-center">
            募集案件詳細
          </Link>
        </Button>
      </div>

      {/* 4. Separator text */}
      <p className="mt-6 text-body-sm text-muted-foreground">以下の内容で応募があります。</p>

      {/* 5. ユーザー情報 section */}
      <div className="mt-4 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">ユーザー情報</h2>
        <div className="flex items-center gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-full bg-muted border border-border">
            {applicant?.avatar_url ? (
              <img src={applicant.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <img src="/images/icons/icon-avatar.png" alt="" className="size-6 opacity-50" />
              </div>
            )}
          </div>
          <div>
            <p className="text-body-lg font-bold text-foreground">
              {contractorName}
              {contractorAge != null && `（${contractorAge}歳）`}
            </p>
            {skills.length > 0 && (
              <p className="text-body-xs text-muted-foreground">
                {skills.map((s) => s.trade_type).join("、")}
              </p>
            )}
          </div>
        </div>

        {/* Verification badges */}
        <div className="flex items-center gap-4 text-body-xs text-muted-foreground">
          {applicant?.identity_verified && (
            <div className="flex items-center gap-1">
              <img src="/images/icons/icon-tag.png" alt="" className="size-3.5" />
              <span>本人確認済み</span>
            </div>
          )}
          {applicant?.ccus_verified && (
            <div className="flex items-center gap-1">
              <img src="/images/icons/icon-tag.png" alt="" className="size-3.5" />
              <span>CCUS登録済み</span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-body-sm text-foreground">
          {areas.length > 0 && (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
              <span className="min-w-[6rem] shrink-0 font-semibold">対応可能エリア</span>
            </div>
          )}
          {areas.length > 0 && (
            <p className="pl-6 text-body-sm">{areas.map((a) => a.prefecture).join("、")}</p>
          )}

          {maxExperienceYears != null && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
              <span className="min-w-[6rem] shrink-0 font-semibold">経験年数</span>
              <span>{maxExperienceYears}年</span>
            </div>
          )}

          {skillTagList.length > 0 && (
            <>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
                <span className="font-semibold">保有スキル</span>
              </div>
              <p className="pl-6 text-body-sm">{skillTagList.join("、")}</p>
            </>
          )}

          {qualifications.length > 0 && (
            <>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
                <span className="font-semibold">保有資格</span>
              </div>
              <p className="pl-6 text-body-sm">
                {qualifications.map((q) => q.qualification_name).join("、")}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 「ユーザー詳細」ボタン */}
      {applicant && (
        <div className="mt-4 flex justify-center">
          <Button className="w-full max-w-xs rounded-full text-white" asChild>
            <Link
              href={`/users/contractors/${applicant.id}`}
              className="inline-flex items-center justify-center"
            >
              ユーザー詳細
            </Link>
          </Button>
        </div>
      )}

      {/* 6. 応募内容 section */}
      <div className="mt-6 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">応募内容</h2>
        <div className="space-y-2 text-body-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[8rem] shrink-0 font-semibold">人数</span>
            <span>{application.headcount}人</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[8rem] shrink-0 font-semibold">日程</span>
            <span>{application.working_type ?? "未定"}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[8rem] shrink-0 font-semibold">希望初回稼働日</span>
            <span>{formatDate(application.preferred_first_work_date, "未定")}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
            <span className="font-semibold">申し送り</span>
          </div>
          {application.message ? (
            <p className="pl-6 text-body-sm text-foreground">{application.message}</p>
          ) : (
            <p className="pl-6 text-body-sm text-muted-foreground">なし</p>
          )}
        </div>
      </div>

      {/* 7. Action buttons */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {application.status === "accepted" && !hasUserReview && (
          <Button className="w-full max-w-xs rounded-full text-white" asChild>
            <Link
              href={`/applications/orders/${application.id}/report`}
              className="inline-flex items-center justify-center"
            >
              評価入力
            </Link>
          </Button>
        )}

        {/* 8. Back button */}
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}
