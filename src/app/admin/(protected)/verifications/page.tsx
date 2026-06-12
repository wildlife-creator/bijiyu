import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  identity: "本人確認",
  ccus: "CCUS",
};

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * ADM-011: 本人確認承認申請一覧。
 * デザインカンプ: design-assets/screens/ADM-011.png
 * （種別ラベルはカンプに無いが、どちらの審査か判別できるよう追加する＝2026-06-11 決定）
 *
 * - status='pending' のみを created_at ASC（古い順＝長く待たせている申請から処理）
 * - 仕組み上、同一ユーザーが identity と ccus の pending を同時に持つことはない
 */
export default async function AdminVerificationsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  const { data: verifications, count } = await admin
    .from("identity_verifications")
    .select(
      `id, document_type, created_at,
       user:users!identity_verifications_user_id_fkey(
         last_name, first_name, email, birth_date, deleted_at
       )`,
      { count: "exact" },
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasPrev = page > 1;
  const hasNext = offset + PAGE_SIZE < total;

  function pageHref(targetPage: number): string {
    return targetPage > 1
      ? `/admin/verifications?page=${targetPage}`
      : "/admin/verifications";
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        本人確認承認申請一覧
      </h1>

      <p className="mt-6 text-body-md font-bold">全：{total}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {(verifications ?? []).length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            審査待ちの申請はありません
          </p>
        ) : (
          (verifications ?? []).map((v) => {
            const name = getUserDisplayName({
              lastName: v.user?.last_name,
              firstName: v.user?.first_name,
              deletedAt: v.user?.deleted_at,
            });
            const age = v.user?.birth_date
              ? calculateAge(v.user.birth_date)
              : null;
            return (
              <Link
                key={v.id}
                href={`/admin/verifications/${v.id}`}
                className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-md font-medium text-foreground">
                    {name}
                    {age !== null && <span>（{age}歳）</span>}
                  </p>
                  <p className="truncate text-body-sm text-muted-foreground">
                    {v.user?.email}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-body-xs font-medium text-primary">
                  {TYPE_LABELS[v.document_type] ?? v.document_type}
                </span>
                <span className="text-muted-foreground">›</span>
              </Link>
            );
          })
        )}
      </div>

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex justify-center gap-3">
          {hasPrev && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page - 1)}>＜前の20件</Link>
            </Button>
          )}
          {hasNext && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page + 1)}>次の20件＞</Link>
            </Button>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/dashboard">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
