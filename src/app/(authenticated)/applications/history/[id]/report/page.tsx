import { notFound, redirect } from "next/navigation";

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
    .select("id, applicant_id, status, jobs(title)")
    .eq("id", id)
    .eq("applicant_id", user.id)
    .single();

  if (!application || application.status !== "accepted") {
    notFound();
  }

  const job = application.jobs as { title: string } | null;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        作業報告・評価入力
      </h1>
      <p className="mt-2 text-body-md text-muted-foreground">
        {job?.title ?? "案件"}
      </p>

      <ContractorReportForm applicationId={application.id} />
    </div>
  );
}
