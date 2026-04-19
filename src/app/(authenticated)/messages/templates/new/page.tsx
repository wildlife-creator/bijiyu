import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ScoutTemplateForm } from "../scout-template-form";

export default async function ScoutTemplateNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        スカウトテンプレート新規登録
      </h1>
      <div className="mt-6">
        <ScoutTemplateForm mode="create" />
      </div>
    </div>
  );
}
