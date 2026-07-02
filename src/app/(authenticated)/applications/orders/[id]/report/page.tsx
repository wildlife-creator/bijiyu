import { notFound, redirect } from "next/navigation";

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
      `id, status, jobs!inner(id, title, owner_id, organization_id)`,
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

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">評価入力</h1>
      <p className="mt-2 text-center text-body-md text-muted-foreground">
        {job.title}
      </p>

      <ClientReportForm applicationId={application.id} />
      </div>
    </div>
  );
}
