import { notFound, redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatDate } from "@/lib/utils/format-date";
import { DecisionForm } from "./decision-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DecisionPage({ params }: Props) {
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
      `id, status, headcount, working_type, preferred_first_work_date, message,
       applicant:users!applications_applicant_id_fkey(id, last_name, first_name, avatar_url, deleted_at, identity_verified, ccus_verified),
       jobs!inner(id, title, trade_type, recruit_end_date, owner_id, prefecture, address)`,
    )
    .eq("id", id)
    .single();

  if (!application || application.status !== "applied") {
    notFound();
  }

  const job = application.jobs as {
    id: string;
    title: string;
    trade_type: string | null;
    recruit_end_date: string | null;
    owner_id: string;
    prefecture: string | null;
    address: string | null;
  };

  // Verify ownership
  if (job.owner_id !== user.id) {
    notFound();
  }

  const applicant = application.applicant as {
    id: string;
    last_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
    deleted_at: string | null;
    identity_verified: boolean | null;
    ccus_verified: boolean | null;
  } | null;

  const applicantName = applicant
    ? getUserDisplayName({
        lastName: applicant.last_name,
        firstName: applicant.first_name,
        deletedAt: applicant.deleted_at,
      })
    : "不明";

  // Fetch applicant skills
  const { data: skills } = applicant
    ? await supabase
        .from("user_skills")
        .select("trade_type")
        .eq("user_id", applicant.id)
    : { data: [] };

  const skillNames = skills?.map((s) => s.trade_type).join("、") ?? "";

  // Fetch existing job documents
  const { data: jobDocuments } = await supabase
    .from("job_images")
    .select("id, image_url")
    .eq("job_id", job.id)
    .eq("image_type", "document")
    .order("sort_order", { ascending: true });

  // Default work location from job
  const defaultWorkLocation = [job.prefecture, job.address].filter(Boolean).join(" ");

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-secondary">発注可否</h1>

      {/* Application summary */}
      <section className="mt-4">
        <h2 className="text-body-lg font-bold text-foreground">応募内容</h2>

        <div className="mt-2 rounded-[8px] border border-border bg-white p-3">
          <p className="text-body-md font-bold text-foreground">{job.title}</p>
          <div className="mt-1 flex items-center justify-between text-body-xs text-muted-foreground">
            <span>{job.trade_type ?? ""}</span>
            <span>締め切り: {formatDate(job.recruit_end_date, "未定")}</span>
          </div>
        </div>

        {/* Applicant info */}
        <div className="mt-4 flex items-start gap-3">
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
            <p className="text-body-lg font-bold text-foreground">{applicantName}</p>
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

        {/* Application details */}
        <div className="mt-3 space-y-1 text-body-md text-foreground">
          <p className="flex items-center gap-2">
            <CircleCheck className="w-4 h-4 text-primary/70 shrink-0" />
            <span className="w-28 shrink-0 text-muted-foreground">人数</span>
            <span>{application.headcount}人</span>
          </p>
          <p className="flex items-center gap-2">
            <CircleCheck className="w-4 h-4 text-primary/70 shrink-0" />
            <span className="w-28 shrink-0 text-muted-foreground">日程</span>
            <span>{application.working_type}</span>
          </p>
          <p className="flex items-center gap-2">
            <CircleCheck className="w-4 h-4 text-primary/70 shrink-0" />
            <span className="w-28 shrink-0 text-muted-foreground">希望初回稼働日</span>
            <span>{formatDate(application.preferred_first_work_date, "未定")}</span>
          </p>
          {application.message && (
            <div>
              <p className="flex items-center gap-2">
                <CircleCheck className="w-4 h-4 text-primary/70 shrink-0" />
                <span className="text-muted-foreground">申し送り</span>
              </p>
              <p className="mt-0.5 pl-6">{application.message}</p>
            </div>
          )}
        </div>
      </section>

      <DecisionForm
        applicationId={application.id}
        defaultWorkLocation={defaultWorkLocation}
        existingDocuments={jobDocuments ?? []}
      />
    </div>
  );
}
