import { notFound, redirect } from "next/navigation";

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
      `id, status, jobs!inner(id, title, owner_id)`,
    )
    .eq("id", id)
    .single();

  if (!application || application.status !== "accepted") {
    notFound();
  }

  const job = application.jobs as { id: string; title: string; owner_id: string };

  if (job.owner_id !== user.id) {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">評価入力</h1>
      <p className="mt-2 text-center text-body-md text-muted-foreground">
        {job.title}
      </p>

      <ClientReportForm applicationId={application.id} />
    </div>
  );
}
