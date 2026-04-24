import { notFound, redirect } from "next/navigation";

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

  const { data: template } = await supabase
    .from("scout_templates")
    .select("id, title, body, memo")
    .eq("id", id)
    .maybeSingle();

  if (!template) notFound();

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
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
  );
}
