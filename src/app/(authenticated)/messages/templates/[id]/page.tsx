import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";

import { DeleteTemplateButton } from "./delete-template-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScoutTemplateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: template } = await supabase
    .from("scout_templates")
    .select("id, title, body, memo, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!template) notFound();

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        スカウトテンプレート詳細
      </h1>

      {/* 削除する ボタン（右寄せ） */}
      <div className="mt-6 flex justify-end">
        <DeleteTemplateButton templateId={template.id} />
      </div>

      {/* 3 セクションのカード */}
      <Card className="mt-4 rounded-[8px] overflow-hidden p-0">
        <SectionLabel>タイトル</SectionLabel>
        <div className="bg-background px-4 py-3">
          <p className="whitespace-pre-wrap text-body-md text-foreground">
            {template.title}
          </p>
        </div>

        <SectionLabel>本文</SectionLabel>
        <div className="bg-background px-4 py-3">
          <p className="whitespace-pre-wrap text-body-md text-foreground">
            {template.body}
          </p>
        </div>

        <SectionLabel>メモ</SectionLabel>
        <div className="bg-background px-4 py-3">
          <p className="whitespace-pre-wrap text-body-md text-foreground">
            {template.memo || "—"}
          </p>
        </div>
      </Card>

      {/* 編集する・もどる */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          asChild
          size="lg"
          className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
        >
          <Link href={`/messages/templates/${template.id}/edit`}>編集する</Link>
        </Button>
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border bg-muted/60 px-4 py-2 first:border-t-0">
      <p className="text-body-sm font-medium text-muted-foreground">{children}</p>
    </div>
  );
}
