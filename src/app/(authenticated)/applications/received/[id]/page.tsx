import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge } from "@/components/shared/application-status-badge";
import { BackButton } from "@/components/shared/back-button";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatDate } from "@/lib/utils/format-date";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceivedApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch application with job and applicant details
  const { data: application } = await supabase
    .from("applications")
    .select(
      `id, status, headcount, working_type, preferred_first_work_date, first_work_date, message, created_at, scout_message_id,
       applicant:users!applications_applicant_id_fkey(id, last_name, first_name, avatar_url, deleted_at, identity_verified, ccus_verified, birth_date),
       jobs!inner(id, title, trade_type, headcount, reward_lower, reward_upper, prefecture, address, work_start_date, work_end_date, recruit_start_date, recruit_end_date, work_hours, schedule_detail, owner_id)`,
    )
    .eq("id", id)
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
    schedule_detail: string | null;
    owner_id: string;
  };

  // Verify current user is job owner
  if (job.owner_id !== user.id) {
    // Check org membership
    const { data: orgCheck } = await supabase
      .from("jobs")
      .select("organization_id")
      .eq("id", job.id)
      .single();

    if (orgCheck?.organization_id) {
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", orgCheck.organization_id)
        .single();

      if (!orgMember) {
        notFound();
      }
    } else {
      notFound();
    }
  }

  const applicant = application.applicant as {
    id: string;
    last_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
    deleted_at: string | null;
    identity_verified: boolean | null;
    ccus_verified: boolean | null;
    birth_date: string | null;
  } | null;

  const applicantName = applicant
    ? getUserDisplayName({
        lastName: applicant.last_name,
        firstName: applicant.first_name,
        deletedAt: applicant.deleted_at,
      })
    : "不明";

  // Calculate age
  let age: number | null = null;
  if (applicant?.birth_date) {
    const birth = new Date(applicant.birth_date);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }

  // Fetch applicant skills, areas, qualifications in parallel
  const [{ data: skills }, { data: areas }, { data: qualifications }] = applicant
    ? await Promise.all([
        supabase
          .from("user_skills")
          .select("trade_type, experience_years")
          .eq("user_id", applicant.id),
        supabase
          .from("user_available_areas")
          .select("prefecture")
          .eq("user_id", applicant.id),
        supabase
          .from("user_qualifications")
          .select("qualification_name")
          .eq("user_id", applicant.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const skillNames = skills?.map((s) => s.trade_type).join("、") ?? "";
  const maxExp = skills?.reduce(
    (max, s) => (s.experience_years && s.experience_years > max ? s.experience_years : max),
    0,
  ) ?? 0;
  const areaNames = areas?.map((a) => a.prefecture).join("、") ?? "";
  const qualificationNames = qualifications?.map((q) => q.qualification_name).join("、") ?? "";

  const rewardText =
    job.reward_lower
      ? `${job.reward_lower.toLocaleString()}円（人工）`
      : "未定";

  const recruitPeriod =
    job.recruit_start_date && job.recruit_end_date
      ? `${formatDate(job.recruit_start_date)} 〜 ${formatDate(job.recruit_end_date)}`
      : "未定";

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">応募詳細</h1>
      <div className="mt-2 flex items-center justify-center gap-3">
        <ApplicationStatusBadge status={application.status} />
        {application.scout_message_id && (
          <span className="rounded-full bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-xs text-primary/70">
            スカウト経由
          </span>
        )}
      </div>

      {/* Job info section */}
      <section className="mt-4 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">案件情報</h2>
        <p className="text-body-lg font-semibold text-foreground">{job.title}</p>
        <p className="text-body-sm text-foreground">
          {job.trade_type ?? ""}
          {job.headcount ? `・${job.headcount}人` : ""}
        </p>

        <div className="space-y-2 text-body-sm text-foreground">
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-coin.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0">報酬</span>
            <span>{rewardText}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-pin.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0">エリア</span>
            <span>{job.prefecture ?? "未定"}{job.address ? ` ${job.address}` : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-calendar.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0">募集期間</span>
            <span>{recruitPeriod}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[6rem] shrink-0">稼働時間</span>
            <span>{job.work_hours ?? "未定"}{job.schedule_detail ? `　${job.schedule_detail}` : ""}</span>
          </div>
        </div>
      </section>

      {/* 募集案件詳細 button */}
      <div className="mt-4 flex justify-center">
        <Button className="w-full max-w-xs rounded-full text-white" asChild>
          <Link href={`/jobs/${job.id}`}>
            募集案件詳細
          </Link>
        </Button>
      </div>

      {/* Separator + message */}
      <div className="mt-6 border-t border-border" />

      <p className="mt-4 text-body-sm text-foreground">
        以下の内容で応募があります。
      </p>

      {/* User info section */}
      <section className="mt-4 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">ユーザー情報</h2>
        <div className="flex items-start gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-full bg-muted">
            {applicant?.avatar_url ? (
              <img src={applicant.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <img src="/images/icons/icon-avatar.png" alt="" className="size-6 opacity-50" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body-lg font-bold text-foreground">
              {applicantName}{age !== null ? `（${age}歳）` : ""}
            </p>
            {skillNames && (
              <p className="text-body-xs text-muted-foreground">{skillNames}</p>
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

        <div className="space-y-2 text-body-sm text-foreground">
          {areaNames && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
              <span className="min-w-[8rem] shrink-0">対応可能エリア</span>
              <span>{areaNames}</span>
            </div>
          )}
          {maxExp > 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
              <span className="min-w-[8rem] shrink-0">経験年数</span>
              <span>{maxExp}年</span>
            </div>
          )}
          {skillNames && (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
              <span className="min-w-[8rem] shrink-0">保有スキル</span>
              <span>{skillNames}</span>
            </div>
          )}
          {qualificationNames && (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
              <span className="min-w-[8rem] shrink-0">保有資格</span>
              <span>{qualificationNames}</span>
            </div>
          )}
        </div>
      </section>

      {/* ユーザー詳細 button */}
      {applicant && (
        <div className="mt-4 flex justify-center">
          <Button className="w-full max-w-xs rounded-full text-white" asChild>
            <Link href={`/users/contractors/${applicant.id}`}>
              ユーザー詳細
            </Link>
          </Button>
        </div>
      )}

      {/* Application details section */}
      <section className="mt-6 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">応募内容</h2>
        <div className="space-y-2 text-body-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[8rem] shrink-0">人数</span>
            <span>{application.headcount}人</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[8rem] shrink-0">日程</span>
            <span>{application.working_type ?? "未定"}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[8rem] shrink-0">希望初回稼働日</span>
            <span>{formatDate(application.preferred_first_work_date, "未定")}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary/70" />
            <span>申し送り</span>
          </div>
          {application.message ? (
            <p className="pl-6 text-body-sm text-foreground">{application.message}</p>
          ) : (
            <p className="pl-6 text-body-sm text-muted-foreground">なし</p>
          )}
        </div>
      </section>

      {/* 発注可否 button — only for applied status */}
      {application.status === "applied" && (
        <div className="mt-6 flex justify-center">
          <Button className="w-full max-w-xs rounded-full text-white" asChild>
            <Link href={`/applications/received/${application.id}/decide`}>
              発注可否
            </Link>
          </Button>
        </div>
      )}

      <div className="mt-4 flex justify-center">
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}
