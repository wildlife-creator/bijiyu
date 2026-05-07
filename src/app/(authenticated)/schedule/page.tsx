import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format-date";

const DESCRIPTION =
  "予定が空いている日程を登録すると、発注者からスカウトが届きやすくなります。";

function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function SchedulePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: schedules } = await supabase
    .from("available_schedules")
    .select("id, start_date, end_date")
    .eq("user_id", user.id)
    .order("start_date", { ascending: true });

  const todayIso = todayLocalIso();

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        空き日程
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-body-md text-muted-foreground">
        {DESCRIPTION}
      </p>

      <section className="mt-6">
        {schedules && schedules.length > 0 ? (
          <ul className="divide-y divide-[rgba(30,30,30,0.1)] rounded-lg border border-[rgba(30,30,30,0.1)] bg-background">
            {schedules.map((s) => {
              const isPast = s.end_date < todayIso;
              return (
                <li key={s.id}>
                  <Link
                    href={`/schedule/${s.id}/edit`}
                    className={`flex items-center justify-between px-4 py-3 text-body-md transition-colors hover:bg-muted ${
                      isPast ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    <span>
                      {formatDate(s.start_date)}〜{formatDate(s.end_date)}
                    </span>
                    <span aria-hidden className="text-bijiyu-purple-bright">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-[rgba(30,30,30,0.1)] bg-background px-4 py-6 text-center text-body-md text-muted-foreground">
            登録された空き日程はありません。
          </p>
        )}
      </section>

      <div className="mx-auto mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button
          asChild
          size="lg"
          className="w-full rounded-pill bg-primary text-white hover:bg-primary/90"
        >
          <Link href="/schedule/new">空き日程を追加する</Link>
        </Button>
        <BackButton href="/mypage" size="lg" />
      </div>
    </div>
  );
}
