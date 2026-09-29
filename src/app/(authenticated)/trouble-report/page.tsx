import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fetchMyPrivateProfile } from "@/lib/users/private-fields";
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
  // （メールアドレスは会員セッションから直接読めない列のため、本人用の関数で読む）
  const [{ data: profile }, privateProfile] = await Promise.all([
    supabase
      .from("users")
      .select("last_name, first_name")
      .eq("id", user.id)
      .maybeSingle(),
    fetchMyPrivateProfile(supabase),
  ]);

  const defaultName =
    profile?.last_name && profile?.first_name
      ? `${profile.last_name}${profile.first_name}`
      : "";
  const defaultEmail = privateProfile?.email ?? user.email ?? "";

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <TroubleReportForm defaultName={defaultName} defaultEmail={defaultEmail} />
      </div>
    </div>
  );
}
