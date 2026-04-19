import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";

import { DeleteTemplateButton } from "./delete-template-button";

function formatCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function resolveOwnerName(owner: {
  last_name: string | null;
  first_name: string | null;
  deleted_at: string | null;
} | null): string {
  if (!owner) return "未設定";
  if (owner.deleted_at) return "退会済みユーザー";
  const last = (owner.last_name ?? "").trim();
  const first = (owner.first_name ?? "").trim();
  return last || first ? `${last}${first}` : "未設定";
}

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
    .select(
      `id, title, body, memo, created_at, organization_id,
       owner:users!owner_id(last_name, first_name, deleted_at)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!template) notFound();

  const owner = Array.isArray(template.owner)
    ? template.owner[0]
    : template.owner;
  const isSharedByOrg = template.organization_id !== null;
  const createdAtLabel = formatCreatedAt(template.created_at);
  const ownerName = isSharedByOrg ? resolveOwnerName(owner) : null;

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

      {/* 作成日（法人プラン共有テンプレのみ作成者氏名も表示） */}
      <div className="mt-3 space-y-0.5 text-body-xs text-muted-foreground">
        <p>作成日: {createdAtLabel}</p>
        {ownerName && <p>作成者: {ownerName}</p>}
      </div>

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
