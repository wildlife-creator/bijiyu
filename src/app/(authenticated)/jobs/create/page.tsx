import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/job-form";
import type { JobFormValues } from "@/lib/validations/job";

interface PageProps {
  searchParams: Promise<{ copyFrom?: string }>;
}

export default async function JobCreatePage({ searchParams }: PageProps) {
  const { copyFrom } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let defaultValues: Partial<JobFormValues> | undefined;

  if (copyFrom) {
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", copyFrom)
      .is("deleted_at", null)
      .single();

    if (job) {
      defaultValues = {
        title: job.title,
        description: job.description ?? "",
        tradeType: job.trade_type ?? "",
        rewardLower: job.reward_lower ?? undefined,
        rewardUpper: job.reward_upper ?? undefined,
        prefecture: job.prefecture ?? "",
        address: job.address ?? "",
        workStartDate: "",
        workEndDate: "",
        recruitStartDate: "",
        recruitEndDate: "",
        headcount: job.headcount ?? undefined,
        workHours: job.work_hours ?? "",
        experienceYears: job.experience_years ?? "",
        requiredSkills: job.required_skills ?? "",
        nationalityLanguage: job.nationality_language ?? "",
        items: job.items ?? "",
        scheduleDetail: job.schedule_detail ?? "",
        projectDetails: job.project_details ?? "",
        ownerMessage: job.owner_message ?? "",
        status: "draft",
      };
    }
  }

  return (
    <div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        募集現場新規登録
      </h1>

      <div className="mt-6">
        <JobForm mode="create" defaultValues={defaultValues} />
      </div>
    </div>
  );
}
