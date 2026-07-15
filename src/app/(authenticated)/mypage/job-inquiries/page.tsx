import Link from "next/link";
import { redirect } from "next/navigation";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/job-search/pagination-controls";
import { BackButton } from "@/components/shared/back-button";
import { formatDateTime } from "@/lib/utils/format-message-time";

const ITEMS_PER_PAGE = 20;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

// COM-014 求人へのお問い合わせ 受信箱一覧（/mypage/job-inquiries）
// RLS は「宛先 client 本人 / 所属している全組織」を返すため、複数組織に
// 所属する代理スタッフでは他組織宛が混ざる。アクティブ組織（法人でなければ
// 本人宛）に必ず絞る。
export default async function JobInquiriesInboxPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const currentPage = Number(params.page) || 1;
  const from = (currentPage - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;

  const { active } = await getActiveOrganizationContext(supabase);

  let countQuery = supabase
    .from("job_inquiries")
    .select("*", { count: "exact", head: true });
  let dataQuery = supabase
    .from("job_inquiries")
    .select("id, created_at, name, topics");

  if (active) {
    countQuery = countQuery.eq("target_organization_id", active.organizationId);
    dataQuery = dataQuery.eq("target_organization_id", active.organizationId);
  } else {
    countQuery = countQuery.eq("target_client_id", user.id);
    dataQuery = dataQuery.eq("target_client_id", user.id);
  }

  const [{ count: totalCount }, { data: inquiries }] = await Promise.all([
    countQuery,
    dataQuery.order("created_at", { ascending: false }).range(from, to),
  ]);

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        求人へのお問い合わせ
      </h1>

      <p className="mt-2 text-body-sm text-muted-foreground">
        全{totalCount ?? 0}件
      </p>

      {(!inquiries || inquiries.length === 0) && (
        <EmptyState className="mt-6">受信した問い合わせはありません</EmptyState>
      )}

      <div className="mt-4 space-y-3">
        {inquiries?.map((row) => (
          <Link key={row.id} href={`/mypage/job-inquiries/${row.id}`}>
            <Card className="rounded-[8px] transition-colors hover:bg-muted">
              <CardContent className="p-4">
                <p className="text-body-xs text-muted-foreground">
                  {formatDateTime(row.created_at)}
                </p>
                <p className="mt-1 text-body-lg font-bold text-foreground">
                  {row.name}
                </p>
                <p className="mt-1 truncate text-body-sm text-primary">
                  {(row.topics ?? []).join("、")}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {totalCount !== null && totalCount > ITEMS_PER_PAGE && (
        <PaginationControls totalCount={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
      )}

      <div className="mt-6">
        <BackButton href="/mypage" />
      </div>
      </div>
    </div>
  );
}
