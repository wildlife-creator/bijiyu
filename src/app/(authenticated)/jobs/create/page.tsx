import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/job-form";
import {
  getAllMasterRows,
  getMunicipalitiesByPrefecture,
  getMunicipalitySortOrderMap,
} from "@/lib/master/fetch";
import { collapseAreasFromDb } from "@/lib/master/area-conversion";
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

  const [
    allTradeTypes,
    candidateMunicipalitiesByPrefecture,
    municipalitySortOrderMap,
  ] = await Promise.all([
    getAllMasterRows("trade-types"),
    getMunicipalitiesByPrefecture(),
    getMunicipalitySortOrderMap(),
  ]);
  const activeTradeTypes = allTradeTypes
    .filter((r) => !r.deprecated_at)
    .map((r) => r.label);
  const deprecatedTradeSet = allTradeTypes
    .filter((r) => r.deprecated_at)
    .map((r) => r.label);

  let defaultValues: Partial<JobFormValues> | undefined;

  if (copyFrom) {
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", copyFrom)
      .is("deleted_at", null)
      .single();

    if (job) {
      // copyFrom 時のエリアは元案件の job_areas を取得して複写
      const { data: copyAreas } = await supabase
        .from("job_areas")
        .select("prefecture, municipality")
        .eq("job_id", copyFrom);

      defaultValues = {
        title: job.title,
        description: job.description ?? "",
        tradeTypes: job.trade_types ?? [],
        rewardLower: job.reward_lower ?? undefined,
        rewardUpper: job.reward_upper ?? undefined,
        areas: collapseAreasFromDb(
          (copyAreas ?? []).map((a) => ({
            prefecture: a.prefecture,
            municipality: a.municipality,
          })),
          municipalitySortOrderMap,
        ),
        workStartDate: "",
        workEndDate: "",
        recruitStartDate: "",
        recruitEndDate: "",
        headcount: job.headcount ?? undefined,
        workHours: job.work_hours ?? "",
        experienceYears: job.experience_years ?? "",
        requiredSkills: job.required_skills ?? "",
        language: job.language ?? [],
        items: job.items ?? "",
        scheduleDetail: job.schedule_detail ?? "",
        projectDetails: job.project_details ?? "",
        ownerMessage: job.owner_message ?? "",
        status: "draft",
      };
    }
  }

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        募集現場新規登録
      </h1>

      <div className="mt-6">
        <JobForm
          mode="create"
          defaultValues={defaultValues}
          activeTradeTypes={activeTradeTypes}
          deprecatedTradeSet={deprecatedTradeSet}
          candidateMunicipalitiesByPrefecture={
            candidateMunicipalitiesByPrefecture
          }
        />
      </div>
      </div>
    </div>
  );
}
