import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/shared/back-button";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { DeleteScheduleButton } from "@/components/schedule/delete-schedule-button";
import { createClient } from "@/lib/supabase/server";

const DESCRIPTION =
  "予定が空いている日程を登録すると、発注者からスカウトが届きやすくなります。";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSchedulePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: schedule } = await supabase
    .from("available_schedules")
    .select("id, user_id, start_date, end_date")
    .eq("id", id)
    .maybeSingle();

  if (!schedule || schedule.user_id !== user.id) notFound();

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        空き日程更新
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-body-md text-muted-foreground">
        {DESCRIPTION}
      </p>

      <div className="mx-auto mt-6 flex w-full max-w-xs flex-col gap-3">
        <ScheduleForm
          mode="edit"
          defaultValues={{
            id: schedule.id,
            startDate: schedule.start_date,
            endDate: schedule.end_date,
          }}
          submitLabel="空き日程を更新する"
        />
        <DeleteScheduleButton scheduleId={schedule.id} />
        <BackButton href="/schedule" size="lg" />
      </div>
    </div>
  );
}
