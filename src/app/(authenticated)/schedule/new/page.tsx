import { redirect } from "next/navigation";

import { BackButton } from "@/components/shared/back-button";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { createClient } from "@/lib/supabase/server";

const DESCRIPTION =
  "予定が空いている日程を登録すると、発注者からスカウトが届きやすくなります。";

export default async function NewSchedulePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        空き日程登録
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-body-md text-muted-foreground">
        {DESCRIPTION}
      </p>

      <div className="mx-auto mt-6 flex w-full max-w-xs flex-col gap-3">
        <ScheduleForm mode="create" submitLabel="空き日程を登録する" />
        <BackButton href="/schedule" size="lg" />
      </div>
    </div>
  );
}
