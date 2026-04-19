import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";
import { ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 20;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

function truncatePreview(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

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

export default async function ScoutTemplatesListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * ITEMS_PER_PAGE;

  const { data: templates, count } = await supabase
    .from("scout_templates")
    .select(
      `id, title, body, memo, created_at, updated_at, organization_id,
       owner:users!owner_id(last_name, first_name, deleted_at)`,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const totalCount = count ?? 0;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        スカウトテンプレート一覧
      </h1>

      {/* 新規作成 ボタン（右寄せ） */}
      <div className="mt-6 flex justify-end">
        <Button
          asChild
          className="rounded-pill bg-primary px-8 text-white hover:bg-primary/90"
        >
          <Link href="/messages/templates/new">新規作成</Link>
        </Button>
      </div>

      {/* テンプレートカードリスト */}
      <div className="mt-4 space-y-3">
        {(templates ?? []).length === 0 ? (
          <Card className="rounded-[8px]">
            <CardContent className="p-6 text-center text-body-md text-muted-foreground">
              スカウトテンプレートはまだ登録されていません
            </CardContent>
          </Card>
        ) : (
          (templates ?? []).map((tpl) => {
            const preview = tpl.memo?.trim() || truncatePreview(tpl.body ?? "");
            const owner = Array.isArray(tpl.owner) ? tpl.owner[0] : tpl.owner;
            // 法人プラン共有テンプレ（organization_id あり）のみ作成者氏名を表示
            const isSharedByOrg = tpl.organization_id !== null;
            const ownerName = isSharedByOrg ? resolveOwnerName(owner) : null;
            const createdAtLabel = formatCreatedAt(tpl.created_at);
            return (
              <Link
                key={tpl.id}
                href={`/messages/templates/${tpl.id}`}
                className="block"
              >
                <Card className="rounded-[8px] transition-colors hover:bg-background/60">
                  <CardContent className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-md font-semibold text-foreground">
                        {tpl.title}
                      </p>
                      {preview && (
                        <p className="mt-1 truncate text-body-sm text-muted-foreground">
                          {preview}
                        </p>
                      )}
                      <p className="mt-1 text-body-xs text-muted-foreground">
                        作成日 {createdAtLabel}
                        {ownerName ? ` ・ 作成者 ${ownerName}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-primary/70" />
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      {/* ページネーション */}
      {totalCount > ITEMS_PER_PAGE && (
        <PaginationControls
          totalCount={totalCount}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      )}

      {/* もどる ボタン */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}
