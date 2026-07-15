import { notFound, redirect } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { ScoutTemplateForm } from "../../scout-template-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScoutTemplateEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // アクティブ組織（法人でなければ本人分）のテンプレのみ編集画面を開ける
  const { active } = await getActiveOrganizationContext(supabase);

  let query = supabase
    .from("scout_templates")
    .select("id, title, body, memo")
    .eq("id", id);

  query = active
    ? query.eq("organization_id", active.organizationId)
    : query.eq("owner_id", user.id);

  const { data: template } = await query.maybeSingle();

  if (!template) notFound();

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        スカウトテンプレート編集
      </h1>
      <div className="mt-6">
        <ScoutTemplateForm
          mode="update"
          templateId={template.id}
          initialValues={{
            title: template.title,
            body: template.body,
            memo: template.memo ?? "",
          }}
        />
      </div>
      </div>
    </div>
  );
}
