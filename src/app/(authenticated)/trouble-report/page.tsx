import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TroubleReportForm } from "./trouble-report-form";

// COM-012 トラブル報告（ログイン必須）
export default async function TroubleReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware で認証必須だが念のため
  if (!user) {
    redirect("/login");
  }

  // 氏名・メールのプリフィル値をサーバーで取得（編集可）
  const { data: profile } = await supabase
    .from("users")
    .select("last_name, first_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const defaultName =
    profile?.last_name && profile?.first_name
      ? `${profile.last_name}${profile.first_name}`
      : "";
  const defaultEmail = profile?.email ?? user.email ?? "";

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <TroubleReportForm defaultName={defaultName} defaultEmail={defaultEmail} />
      </div>
    </div>
  );
}
