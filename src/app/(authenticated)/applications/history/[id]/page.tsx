import { notFound, redirect } from "next/navigation";
import { Clock, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ApplicationStatusBadge } from "@/components/shared/application-status-badge";
import { CancelButton } from "./cancel-button";
import { BackButton } from "../back-button";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format-date";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: Props) {
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
      `*, jobs(id, title, trade_type, headcount, reward_lower, reward_upper, prefecture, address,
              work_start_date, work_end_date, recruit_start_date, recruit_end_date,
              work_hours, items, required_skills, schedule_detail, etc_message,
              organizations(name),
              owner:users!jobs_owner_id_fkey(company_name)),
       client_reviews(id),
       user_reviews(id)`,
    )
    .eq("id", id)
    .eq("applicant_id", user.id)
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
    items: string | null;
    required_skills: string | null;
    schedule_detail: string | null;
    etc_message: string | null;
    organizations: { name: string } | null;
    owner: { company_name: string | null } | null;
  } | null;

  const hasClientReview =
    application.client_reviews != null &&
    (!Array.isArray(application.client_reviews) || application.client_reviews.length > 0);
  const hasUserReview =
    application.user_reviews != null &&
    (!Array.isArray(application.user_reviews) || application.user_reviews.length > 0);

  const companyName =
    job?.organizations?.name ?? job?.owner?.company_name ?? "不明";

  // Cancel check: accepted + first_work_date - 5 days
  let canCancel = false;
  let cancelDisabledReason = "";
  if (application.status === "accepted") {
    if (application.first_work_date) {
      const deadline = new Date(application.first_work_date);
      deadline.setDate(deadline.getDate() - 5);
      if (new Date() < deadline) {
        canCancel = true;
      } else {
        cancelDisabledReason =
          "初回稼働日の5日前を過ぎたため、システムからはキャンセルできません。";
      }
    } else {
      canCancel = true;
    }
  }

  // Fetch job-level documents (image_type='document') for the documents section
  const { data: jobDocuments } = job?.id
    ? await supabase
        .from("job_images")
        .select("id, image_url")
        .eq("job_id", job.id)
        .eq("image_type", "document")
        .order("sort_order", { ascending: true })
    : { data: [] };

  // Generate signed URLs for application-level documents (private bucket)
  // Handle both formats: old data may have full URLs, new data stores file paths only
  const applicationDocPaths = (application.document_urls as string[] | null) ?? [];
  const signedDocUrls: string[] = [];
  for (const entry of applicationDocPaths) {
    if (entry.startsWith("http")) {
      // Legacy full URL — extract path from public URL format
      const pathMatch = entry.match(/\/object\/public\/application-documents\/(.+)$/);
      if (pathMatch) {
        const { data } = await supabase.storage
          .from("application-documents")
          .createSignedUrl(pathMatch[1], 3600);
        if (data?.signedUrl) {
          signedDocUrls.push(data.signedUrl);
        }
      }
    } else {
      const { data } = await supabase.storage
        .from("application-documents")
        .createSignedUrl(entry, 3600);
      if (data?.signedUrl) {
        signedDocUrls.push(data.signedUrl);
      }
    }
  }

  // Combine job-level (public URLs) + application-level (signed URLs)
  const allDocumentUrls: string[] = [
    ...(jobDocuments?.map((d) => d.image_url) ?? []),
    ...signedDocUrls,
  ];

  const rewardText =
    job?.reward_lower
      ? `${job.reward_lower.toLocaleString()}円（人工）`
      : "未定";

  const recruitPeriod =
    job?.recruit_start_date && job?.recruit_end_date
      ? `${formatDate(job.recruit_start_date)} 〜 ${formatDate(job.recruit_end_date)}`
      : "未定";

  const workPeriod =
    job?.work_start_date && job?.work_end_date
      ? `${formatDate(job.work_start_date)} 〜 ${formatDate(job.work_end_date)}`
      : null;

  return (
    <div className="min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8">
      {/* 1. Header */}
      <h1 className="text-center text-heading-lg font-bold text-secondary">応募詳細</h1>

      {/* 2. Status badge */}
      <div className="mt-2 flex items-center gap-2">
        <ApplicationStatusBadge
          status={application.status}
          hasClientReview={hasClientReview}
          hasUserReview={hasUserReview}
        />
        {application.scout_message_id && (
          <span className="rounded-full bg-[rgba(146,7,131,0.08)] px-2 py-0.5 text-xs text-primary/70">
            スカウト経由
          </span>
        )}
      </div>

      {/* Notice for cancelled/rejected */}
      {(application.status === "cancelled" || application.status === "rejected") && (
        <p className="mt-3 text-body-sm text-red-500">
          {application.status === "rejected"
            ? "この応募はお断りとなりました。稼働は行われていません。"
            : "この応募はキャンセルしました。稼働は行われていません。"}
        </p>
      )}

      {/* 3. Job info section — no Card wrapper */}
      <div className="mt-4 space-y-3">
        <p className="text-body-lg font-semibold text-foreground">
          {job?.title ?? "不明な案件"}
        </p>
        <p className="text-body-sm text-muted-foreground">{companyName}</p>

        {/* Trade type + headcount */}
        <p className="text-body-sm text-foreground">
          {job?.trade_type ?? ""}
          {job?.headcount ? `・${job.headcount}人` : ""}
        </p>

        <div className="space-y-2 text-body-sm text-foreground">
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-coin.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0 font-semibold">報酬</span>
            <span>{rewardText}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-pin.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0 font-semibold">エリア</span>
            <span>{job?.prefecture ?? "未定"}{job?.address ? ` ${job.address}` : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/images/icons/icon-calendar.png" alt="" className="size-4 shrink-0" />
            <span className="min-w-[6rem] shrink-0 font-semibold">募集期間</span>
            <span>{recruitPeriod}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-primary/70" />
            <span className="min-w-[6rem] shrink-0 font-semibold">稼働時間</span>
            <span>{job?.work_hours ?? "未定"}</span>
          </div>
        </div>
      </div>

      {/* 4. 「募集案件詳細」ボタン → CON-003 */}
      {job?.id && (
        <div className="mt-4 flex justify-center">
          <Button className="w-full max-w-xs rounded-full text-white" asChild>
            <Link href={`/jobs/${job.id}`} className="inline-flex items-center justify-center">
              募集案件詳細
            </Link>
          </Button>
        </div>
      )}

      {/* 5. 「以下の内容で応募済みです。」セクション — no Card wrapper */}
      <div className="mt-6 space-y-3">
        <h2 className="text-body-lg font-bold text-foreground">
          以下の内容で応募済みです。
        </h2>
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

      {/* 6. 「勤務についての詳細」セクション — accepted のみ、Card で囲む */}
      {application.status === "accepted" && (
        <div className="mt-6">
          <h2 className="mb-2 text-body-lg font-bold text-foreground">勤務についての詳細</h2>
          <div className="space-y-3 rounded-[8px] border border-border bg-background p-4 text-body-sm text-foreground">
            <div>
              <span className="font-semibold">【勤務地】</span>
              <p className="pl-4">{job?.prefecture ?? "—"}{job?.address ? ` ${job.address}` : ""}</p>
            </div>
            <div>
              <span className="font-semibold">【勤務日・稼働時間】</span>
              <p className="pl-4">{workPeriod ?? "—"}</p>
              {job?.work_hours && <p className="pl-4">{job.work_hours}</p>}
              {job?.schedule_detail && <p className="pl-4 text-muted-foreground">{job.schedule_detail}</p>}
            </div>
            <div>
              <span className="font-semibold">【持ち物】</span>
              <p className="pl-4">{job?.items ?? "—"}</p>
            </div>
            <div>
              <span className="font-semibold">【必須スキル】</span>
              <p className="pl-4">{job?.required_skills ?? "—"}</p>
            </div>
            <div>
              <span className="font-semibold">【業務に関する書類】</span>
              {allDocumentUrls.length > 0 ? (
                <div className="mt-1 space-y-2 pl-4">
                  {allDocumentUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`業務書類 ${i + 1}`}
                      className="h-40 w-full rounded-[8px] border border-border object-contain bg-muted"
                    />
                  ))}
                </div>
              ) : (
                <p className="pl-4 text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <span className="font-semibold">【その他】</span>
              <p className="pl-4">{application.client_notes ?? "—"}</p>
            </div>
            <div>
              <span className="font-semibold">【初回稼働日】</span>
              <p className="pl-4 font-semibold">{formatDate(application.first_work_date)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 7-8. Action buttons — accepted のみ */}
      {application.status === "accepted" && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {/* Cancel text link */}
          {canCancel ? (
            <CancelButton applicationId={application.id} />
          ) : (
            cancelDisabledReason && (
              <p className="text-body-sm text-destructive">
                {cancelDisabledReason}
              </p>
            )
          )}

          {/* Evaluation button */}
          {!hasClientReview && (
            <Button className="w-full max-w-xs rounded-full text-white" asChild>
              <Link
                href={`/applications/history/${application.id}/report`}
                className="inline-flex items-center justify-center"
              >
                評価を入力する
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* 9. Back button */}
      <div className="mt-4 flex justify-center">
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}
