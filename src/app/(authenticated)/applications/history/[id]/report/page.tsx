import { notFound, redirect } from "next/navigation";

import {
  evaluateReviewInputWindow,
  reviewInputWindowMessage,
} from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { ContractorReportForm } from "./contractor-report-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContractorReportPage({ params }: Props) {
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
    .select("id, applicant_id, status, first_work_date, jobs(title, work_end_date)")
    .eq("id", id)
    .eq("applicant_id", user.id)
    .single();

  if (!application || application.status !== "accepted") {
    notFound();
  }

  const job = application.jobs as {
    title: string;
    work_end_date: string | null;
  } | null;

  // 入力可能期間チェック（初回稼働日〜稼働終了日+5日）。期間外はフォームを出さず案内を表示
  const reviewWindow = evaluateReviewInputWindow({
    firstWorkDate: application.first_work_date,
    workEndDate: job?.work_end_date ?? null,
  });

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        作業報告・評価入力
      </h1>
      <p className="mt-2 text-body-md text-muted-foreground">
        {job?.title ?? "案件"}
      </p>

      {reviewWindow.allowed ? (
        <ContractorReportForm applicationId={application.id} />
      ) : (
        <div className="mt-6 rounded-lg border border-border bg-background p-6 text-center">
          <p className="text-body-md text-muted-foreground">
            {reviewInputWindowMessage(reviewWindow)}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
