import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/job-form";
import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
} from "@/lib/master/fetch";
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

  // Fetch existing images + job_areas in parallel
  const [{ data: images }, { data: jobAreas }] = await Promise.all([
    supabase
      .from("job_images")
      .select("id, image_url, image_type, sort_order")
      .eq("job_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("job_areas")
      .select("prefecture, municipality")
      .eq("job_id", id),
  ]);

  // Map to form default values
  const defaultValues: Partial<JobFormValues> = {
    title: job.title,
    description: job.description ?? "",
    tradeTypes: job.trade_types ?? [],
    rewardLower: job.reward_lower ?? undefined,
    rewardUpper: job.reward_upper ?? undefined,
    areas: (jobAreas ?? []).map((a) => ({
      prefecture: a.prefecture,
      municipality: a.municipality,
    })),
    address: job.address ?? "",
    workStartDate: job.work_start_date ?? "",
    workEndDate: job.work_end_date ?? "",
    recruitStartDate: job.recruit_start_date ?? "",
    recruitEndDate: job.recruit_end_date ?? "",
    headcount: job.headcount ?? undefined,
    workHours: job.work_hours ?? "",
    experienceYears: job.experience_years ?? "",
    requiredSkills: job.required_skills ?? "",
    language: job.language ?? [],
    items: job.items ?? "",
    scheduleDetail: job.schedule_detail ?? "",
    projectDetails: job.project_details ?? "",
    ownerMessage: job.owner_message ?? "",
    status: job.status,
  };

  const existingImages = (images ?? []).map((img) => ({
    id: img.id,
    imageUrl: img.image_url,
    imageType: img.image_type,
    sortOrder: img.sort_order,
  }));

  const [allTradeTypes, municipalitiesByPrefecture] = await Promise.all([
    getAllMasterRows("trade-types"),
    getMunicipalitiesByPrefecture(),
  ]);
  const activeTradeTypes = allTradeTypes
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const deprecatedTradeSet = allTradeTypes
    .filter((r) => r.deprecated_at)
    .map((r) => r.label);

  return (
    <div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        募集現場編集
      </h1>

      <div className="mt-6">
        <JobForm
          mode="edit"
          defaultValues={defaultValues}
          existingImages={existingImages}
          jobId={id}
          activeTradeTypes={activeTradeTypes}
          deprecatedTradeSet={deprecatedTradeSet}
          municipalitiesByPrefecture={municipalitiesByPrefecture}
        />
      </div>
    </div>
  );
}
