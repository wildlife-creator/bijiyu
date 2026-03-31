import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/job-form";
import type { JobFormValues } from "@/lib/validations/job";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch existing job
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) {
    notFound();
  }

  // Fetch existing images
  const { data: images } = await supabase
    .from("job_images")
    .select("id, image_url, image_type, sort_order")
    .eq("job_id", id)
    .order("sort_order", { ascending: true });

  // Map to form default values
  const defaultValues: Partial<JobFormValues> = {
    title: job.title,
    description: job.description ?? "",
    tradeType: job.trade_type ?? "",
    rewardLower: job.reward_lower ?? undefined,
    rewardUpper: job.reward_upper ?? undefined,
    prefecture: job.prefecture ?? "",
    address: job.address ?? "",
    workStartDate: job.work_start_date ?? "",
    workEndDate: job.work_end_date ?? "",
    recruitStartDate: job.recruit_start_date ?? "",
    recruitEndDate: job.recruit_end_date ?? "",
    headcount: job.headcount ?? undefined,
    workHours: job.work_hours ?? "",
    experienceYears: job.experience_years ?? "",
    requiredSkills: job.required_skills ?? "",
    nationalityLanguage: job.nationality_language ?? "",
    items: job.items ?? "",
    scheduleDetail: job.schedule_detail ?? "",
    projectDetails: job.project_details ?? "",
    ownerMessage: job.owner_message ?? "",
    location: job.location ?? "",
    etcMessage: job.etc_message ?? "",
    status: job.status,
  };

  const existingImages = (images ?? []).map((img) => ({
    id: img.id,
    imageUrl: img.image_url,
    imageType: img.image_type,
    sortOrder: img.sort_order,
  }));

  return (
    <div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-secondary">
        募集現場編集
      </h1>

      <div className="mt-6">
        <JobForm
          mode="edit"
          defaultValues={defaultValues}
          existingImages={existingImages}
          jobId={id}
        />
      </div>
    </div>
  );
}
