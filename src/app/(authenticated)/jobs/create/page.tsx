import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/job-form";

export default async function JobCreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-secondary">
        募集現場新規登録
      </h1>

      <div className="mt-6">
        <JobForm mode="create" />
      </div>
    </div>
  );
}
