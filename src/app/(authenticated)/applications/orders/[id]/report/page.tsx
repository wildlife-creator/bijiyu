import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/shared/back-button";
import {
  evaluateReviewInputWindow,
  reviewInputWindowMessage,
} from "@/lib/matching";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { ClientReportForm } from "./client-report-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientReportPage({ params }: Props) {
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
      `id, status, first_work_date, jobs!inner(id, title, owner_id, organization_id, work_end_date)`,
    )
    .eq("id", id)
    .single();

  if (!application || application.status !== "accepted") {
    notFound();
  }

  const job = application.jobs as {
    id: string;
    title: string;
    owner_id: string;
    organization_id: string | null;
    work_end_date: string | null;
  };

  // Verify job owner or same-org member (法人スタッフも完了報告を送れる)
  if (job.owner_id !== user.id) {
    if (!job.organization_id) {
      notFound();
    }
    const { active } = await getActiveOrganizationContext(supabase);
    if (active?.organizationId !== job.organization_id) {
      notFound();
    }
  }

  // 入力可能期間チェック（初回稼働日〜稼働終了日+5日）。期間外はフォームを出さず案内を表示
  const reviewWindow = evaluateReviewInputWindow({
    firstWorkDate: application.first_work_date,
    workEndDate: job.work_end_date,
  });

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">評価入力</h1>
      <p className="mt-2 text-center text-body-md text-muted-foreground">
        {job.title}
      </p>

      {reviewWindow.allowed ? (
        <ClientReportForm applicationId={application.id} />
      ) : (
        <>
          <div className="mt-6 rounded-lg border border-border bg-background p-6 text-center">
            <p className="text-body-md text-muted-foreground">
              {reviewInputWindowMessage(reviewWindow)}
            </p>
          </div>
          <div className="mx-auto mt-6 flex w-full max-w-xs flex-col gap-3">
            <BackButton />
          </div>
        </>
      )}
      </div>
    </div>
  );
}
